# Sighting Likes — Design

**Status:** design approved via brainstorm; pending spec review → plan.
**Date:** 2026-07-16

## Goal

Let anyone (no login) "like" one of Natalie's sightings with a tappable heart,
show a like count, and keep the feature **open** while resisting casual abuse —
using app-level defenses proportionate to a low-stakes family app.

## Decisions (from brainstorm)

1. **Like model:** a toggleable heart — tap to like, tap again to unlike. The
   count is the number of **unique likers**. A visitor's heart stays filled when
   they return (per device).
2. **Visitor identity:** a random **device ID** in the browser's `localStorage`.
   Dedup key is `(sighting_id, device_id)`. CF-Connecting-IP is the rate-limit
   backstop (trustworthy because the origin is tunnel-only).
3. **Abuse posture:** **app-only baseline** — a `UNIQUE (sighting_id, device_id)`
   constraint plus a dedicated per-IP rate limit on the like routes. No
   Cloudflare dashboard changes now; CF levers documented as future escalations.
4. **UI:** tap-to-like **directly in the feed rows** (and on the detail page).
   Rows are restructured so the heart is a sibling control, not nested in the
   row's open-button.

## Split source of truth

- **Server owns counts.** Each like is a row keyed by `device_id`, so counts are
  accurate and dedup is enforced in the database.
- **Client owns "my hearts."** The browser stores its own `device_id` *and* the
  set of sighting IDs it has liked, in `localStorage`. The public
  `GET /api/sightings` therefore stays uniform and cacheable — no per-device
  variation, no device ID sent on reads.

Consequence (accepted): clearing `localStorage` makes a visitor "new" (empty
hearts) and lets them like again. Low-stakes, and bounded by the IP rate limit.

## Data model

New table `sighting_likes` (Drizzle, `server/db/schema.ts`):

```ts
export const sightingLikes = pgTable(
  'sighting_likes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sightingId: uuid('sighting_id')
      .notNull()
      .references(() => sightings.id, { onDelete: 'cascade' }),
    deviceId: text('device_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ uniqDeviceSighting: unique('sighting_likes_sighting_device').on(t.sightingId, t.deviceId) }),
)
```

- The `unique(sighting_id, device_id)` index has `sighting_id` leading, so it
  also serves `COUNT(*) … GROUP BY sighting_id` — **no separate index needed**.
- Cascade delete: removing a sighting removes its likes.
- Migration: schema change → `pnpm db:generate --name add-sighting-likes`; commit
  everything under `app/drizzle/` incl. `meta/`. Migrations run at startup.

**Counting strategy is decided by the optimization spike below** (the leading
hypothesis is derive-on-read: `COUNT(*) GROUP BY sighting_id` merged into the
list as `likeCount`, which avoids counter drift). Because adding `likeCount` to
the public `GET /api/sightings` risks turning every read into an aggregation, we
do **not** commit to a data-access approach until the spike measures it.

## Optimization research spike (do this FIRST)

Adding `likeCount` to the public sightings list is the main DB-load risk: the
list is a public GET that can be hit often, and a naive per-request aggregation
over `sighting_likes` scales with reads × likes. The spike de-risks the
data-access design **before** any feature code, and its findings pick the
counting strategy above. It is a throwaway investigation; output is a short
findings note (append to this spec or a sibling `*-spike-findings.md`) + the
chosen approach feeding the plan.

**Questions to answer:**

1. **Read frequency.** How often is `GET /api/sightings` actually hit? Check the
   client for polling cadence (`useSightings`/refetch), the RSS `buildFeed`
   query, and any PWA/service-worker refetch. This sets how much read-side cost
   matters.
2. **Query strategy cost.** With realistic volumes (state current counts, then
   project e.g. 10× and 100× sightings and likes), `EXPLAIN ANALYZE` the
   candidates and compare:
   - (a) **Derive per request** — one grouped-count query (or `LEFT JOIN … GROUP
     BY`) alongside the list. Simplest; the `(sighting_id, device_id)` unique
     index already covers the `GROUP BY sighting_id`.
   - (b) **Separate aggregate, merged in app** — fetch the page's sightings, then
     one `SELECT sighting_id, COUNT(*) … WHERE sighting_id = ANY($ids) GROUP BY`
     merged in code. Bounds the aggregate to the returned page.
   - (c) **Denormalized `like_count` column** on `sightings`, maintained in the
     same transaction as like/unlike. O(1) reads, small write cost, drift risk.
   - Confirm the index is actually used (index-only scan?) and whether counts add
     meaningful latency vs the existing list query.
3. **Caching the uniform public GET.** Because we deliberately kept the list
   **device-independent** (client owns hearts), the public response is identical
   for everyone — so it's cacheable. Evaluate:
   - a short **`Cache-Control`** (e.g. 10–30s) so Cloudflare's edge serves most
     reads and the DB is queried at most ~once per TTL. This is likely the single
     biggest lever and ties into the existing Cloudflare tunnel — counts become
     eventually-consistent by a few seconds, which is fine (the client already
     optimistically reflects its own likes).
   - a tiny in-process count cache as a fallback if edge caching is undesirable.
   - Trade-off to note: caching delays new sightings/likes appearing by up to the
     TTL; confirm that's acceptable and that write routes stay uncached.

**Decision criteria:** pick the simplest strategy whose projected cost is
comfortably flat at 100× volume. Prefer (a)+edge-cache unless the spike shows a
real hotspot; escalate to (b) then (c) only if measured. Record the numbers.

**Deliverable:** findings note with the volumes tested, `EXPLAIN ANALYZE`
summaries, the chosen counting strategy, and the caching decision (TTL or none).
The implementation plan's data-access + caching tasks are written from this.

## API (public — no `writeGate`)

- `POST /api/sightings/:id/like` — like. Idempotent: if the `(id, deviceId)` row
  exists, it's a no-op. Insert with `ON CONFLICT DO NOTHING`.
- `DELETE /api/sightings/:id/like` — unlike. Idempotent: deleting a non-existent
  like is a no-op.
- **Device ID travels in an `X-Device-Id` header** (works for both verbs, avoids
  body-on-DELETE quirks; same-origin so no CORS preflight).
- Both validate `:id` and `X-Device-Id` are UUIDs (`UUID_RE`); junk → 400,
  nothing written (fail closed).
- Both return the authoritative updated count: `{ likeCount: number }` (200).
- `GET /api/sightings` gains `likeCount` per row via `toPublicSighting`.

### Rate limiting

- New `likeLimiter` (`express-rate-limit`) on the like routes, keyed on the
  existing `clientKey` (CF-Connecting-IP), with a **generous** ceiling —
  anti-flood, not anti-enthusiasm, since dedup already bounds correctness. Add
  `likePerMin` to the `rateLimits` config (default ~40; tunable). The existing
  `mutationLimiter` (30/min, skips GET) still applies as a second ceiling.
- Generous by design so a viewing party sharing one home IP isn't throttled.

## Client

- New `src/lib/likes.ts`:
  - `deviceId()` — read/create a UUID in `localStorage['nac-device-id']`
    (`crypto.randomUUID()`).
  - a liked-set persisted in `localStorage['nac-liked']` (array of sighting IDs),
    with `hasLiked(id)`, `markLiked(id)`, `markUnliked(id)`.
  - `like(id)` / `unlike(id)` — `fetch` with the `X-Device-Id` header, return the
    new count.
- **Optimistic UI:** tapping fills the heart and adjusts the count immediately,
  then reconciles to the server's returned count; on failure, revert and toast.
- Hearts reflect the local liked-set; counts reflect server data from the list.

## UI

- **`SightingRow` restructure:** today the whole row is one `<button>`
  (`row-button`) that opens the detail. Split so the row is a container with two
  sibling controls: the **open** target (emoji + name + meta, still opens detail)
  and a separate **like button** (heart + count) on the right. No nested
  interactive elements; both get proper `aria-label`s, the heart also
  `aria-pressed`. This flows to History, Recent Critters, and Day Detail (all use
  `SightingRow`).
- **`SightingDetail`** also shows the heart + count (larger), same behavior.
- Heart states: filled ❤️ when in the liked-set, outline otherwise; count beside
  it (hidden or "0" when none — decide in plan, lean toward showing only when >0
  to keep rows calm, matching the `📸`/`⭐` markers).

## Security & abuse (app-only baseline)

Defense layers, in order:

1. **Correctness:** `UNIQUE (sighting_id, device_id)` — re-liking is a no-op, so
   the only way to inflate is to mint many device IDs.
2. **Velocity:** per-IP `likeLimiter` on the like routes (CF-Connecting-IP is
   spoofing-proof here because the origin binds `127.0.0.1`, tunnel-only).
3. **Input hygiene:** UUID validation on `:id` and `X-Device-Id`; fail closed.

Reads stay public; likes are the first **public write** — that's intentional and
the reason for the dedicated limiter + dedup. Device IDs are random, not PII, and
never exposed in the public GET (only counts are).

### Deferred Cloudflare escalations (documented, not built)

Pull these from the Cloudflare dashboard if abuse ever appears — no code changes
except Turnstile:

- **Bot Fight Mode** (free toggle) — challenges known bots automatically.
- **Rate Limiting rule** (free plan includes one) — cap
  `POST/DELETE /api/sightings/*/like` per IP at the **edge**, dropping floods
  before they reach the origin.
- **Turnstile** (free) — human-proof the first like from a device. Requires CSP
  additions (`script-src` + `frame-src` for `challenges.cloudflare.com`), a
  client script/iframe, and a server-side verify call. Heaviest lever; keep as
  last resort.

## Non-goals

- Cross-device sync of a person's hearts (each device is its own liker).
- Likes in the RSS feed or the leaderboard/insights.
- Turnstile / Cloudflare dashboard changes in the initial build.
- Any denormalized like counter (derive until proven necessary).

## Risks & mitigations

- **localStorage reset → re-like.** Accepted; bounded by the IP rate limit and
  the low stakes. Turnstile is the escalation if needed.
- **Shared-IP throttling** (a viewing party behind one IP). Mitigate with a
  generous `likePerMin` ceiling; dedup keeps correctness regardless.
- **Count aggregation cost / over-querying the DB.** The primary load risk;
  de-risked up front by the **optimization research spike** (query strategy +
  edge-caching the uniform public GET). Denormalize only if the spike shows a
  real hotspot.
- **Row a11y regression** from restructuring the row. Mitigate with explicit
  tests that the open target and like button are separate, non-nested controls.

## Testing

- **Server (integration, real PG):** dedup via the unique constraint;
  `POST`/`DELETE` idempotency; `likeCount` appears in the list; cascade delete.
- **Server (unit):** like routes are public (no auth), validate `:id` +
  `X-Device-Id`, return the updated count, and are covered by the limiter.
- **Client:** `likes.ts` device-id creation/persistence, liked-set, optimistic
  update + rollback on failure.
- **UI (real render gate):** `SightingRow` heart toggles, shows count, and the
  open target + like button are separate controls (not nested). Verify the row
  layout in a real browser render per the repo's visual-gate rule.
</content>
