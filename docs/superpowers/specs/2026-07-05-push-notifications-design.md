# Push Notifications Cycle — Design Spec

**Date:** 2026-07-05
**Status:** Approved
**Depends on:** prior cycles through photo upload (PR #10 / 346d02f). Independent of
the quick-followups cycle (no debt opener here — that cycle clears the ledger); the
two touch different files apart from trivial `app.ts` wiring, so they can land in
either order.

## Purpose

When Natalie logs a critter sighting dated today, her friends' phones buzz with a
notification like **"🦝 Natalie saw a Raccoon!"** — tapping it opens the site.
Friends opt in by tapping a bell button; nothing prompts on page load. Because the
audience is mostly iPhones, the site becomes an installable PWA (manifest + service
worker), and the bell walks iOS users through Add to Home Screen first — web push on
iOS only works from an installed PWA.

## Decisions (alternatives considered)

| Decision | Choice | Alternatives rejected |
|---|---|---|
| Channel | Self-hosted Web Push (VAPID) via the `web-push` package; site becomes a PWA | ntfy.sh relay (third-party app per friend, guessable public topic); Telegram/Discord bot (relocates the experience into a chat app, excludes non-users) |
| Who can subscribe | Anyone who visits — subscription endpoints are public | Invite gate / named friends (friction + build for a friends-and-family site) |
| Notification content | Rich: emoji + name in the title, place/comment in the body, tap opens the site | Minimal teaser (less charming); photo in the notification (photo often arrives after the sighting is logged) |
| When to notify | `sightedOn >= UTC yesterday`, no batching — bursts send multiple notifications | Every sighting (backdated catch-up spams); debounced batching (delay + code for a non-problem) |
| Send timing | Fire-and-forget after the 201 response; `Promise.allSettled` fan-out inline in the server process | Queue/retry infrastructure (YAGNI at this scale); blocking the sighting POST on delivery |
| Keys unset | Push endpoints 503, notifier no-op — mirrors the writes-disabled pattern | Hard startup failure (push is optional, dev stacks shouldn't need keys) |
| Service worker | Hand-written `public/sw.js`: `push` + `notificationclick` only, no caching | vite-plugin-pwa / Workbox precache (offline is a separate project; stale-cache bugs aren't worth it) |
| Unsubscribe auth | DELETE requires knowing the endpoint URL — endpoints are unguessable, possession is proof of ownership | Auth tokens per subscription (YAGNI) |
| VAPID public key to client | `GET /api/push/vapid-public-key` at runtime | Baking into the Vite build (key rotation would require a rebuild) |

## Server — `app/server/push/`

New feature module mirroring `sightings/` and `profiles/`: `store.ts`, `routes.ts`,
`notifier.ts`.

**Schema** (migration, auto-applied at startup):

```ts
export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Unique: re-subscribing from the same browser upserts, never duplicates.
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
```

**Store** (`PushStore`): `upsert({ endpoint, p256dh, auth })` (insert or update keys
on endpoint conflict), `removeByEndpoint(endpoint): Promise<boolean>`, `listAll()`.

**Routes** (`/api/push`, all public):
- `GET /api/push/vapid-public-key` → `{ key }`. 503 when push is unconfigured.
- `POST /api/push/subscriptions` — body `{ endpoint, keys: { p256dh, auth } }`
  (the browser's `PushSubscription.toJSON()` shape). Validation via the shared
  `httpValidation` helpers: endpoint must be an `https:` URL ≤ 1000 chars; keys
  must be non-empty strings ≤ 200 chars; unknown fields rejected. Upsert → 201
  `{ ok: true }`. 503 when unconfigured.
- `DELETE /api/push/subscriptions` — body `{ endpoint }`. 204 whether or not the
  row existed (idempotent). 503 when unconfigured.

**Notifier** (`notifier.ts`) — constructed with VAPID config (or null), the store,
a clock, and a send transport (the `web-push` `sendNotification` function; injected
so tests never hit a push service):
- `notifySighting(sighting)`: no-op when unconfigured or when
  `sighting.sightedOn < UTC yesterday` (the one-day widening keeps an evening
  sighting logged in a US timezone "today" even after UTC rolls over; backdated
  entries stay silent).
- Payload: title `🦝 Natalie saw a Raccoon!` using the sighting's emoji and name
  (fallback: `Natalie saw a critter!` when unnamed); body joins `place` and
  `comment` with ` — ` when present (empty body otherwise); `data.url = '/'`.
- Fan-out: `listAll()` → `Promise.allSettled`. A rejection with `statusCode` 404 or
  410 prunes that subscription via `removeByEndpoint`; anything else is logged and
  ignored. No retries.
- Caller: the existing `POST /api/sightings` handler calls
  `void notifier.notifySighting(created)` after `store.create` and before/while
  responding 201 — delivery never delays or fails the API response. The notifier
  catches all its own errors.

**Wiring:** `createApp` deps gain `pushStore` and `notifier`; `index.ts` builds the
notifier from env (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) with
null config when the key pair is absent, logging one startup line either way
(`push notifications enabled/disabled`).

## Client — PWA shell

- `public/manifest.webmanifest`: name "Natalie Saw a Critter!", short name
  "Critters", `display: standalone`, start URL `/`, theme/background colors matching
  the app, icons 192 + 512 (simple generated critter/paw icons, committed as static
  PNGs) plus `apple-touch-icon` link in `index.html`.
- `public/sw.js` (plain JS, copied verbatim by Vite):
  - `push` handler: `event.data.json()` → `showNotification(title, { body, data })`.
  - `notificationclick`: close the notification, focus an existing client window if
    one exists, else `clients.openWindow(data.url)`.
  - No fetch handler, no caches.
- Registration from `main.tsx`: `navigator.serviceWorker.register('/sw.js')` behind
  a feature check; failures logged, never user-visible.

## Client — bell UI

**`NotifyBell`** (new `app/src/components/NotifyBell.tsx`, rendered in `Header`),
a small state machine:

1. **off** — outline bell 🔔, label "Get notified". Tap: request `Notification`
   permission → `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`
   with the fetched VAPID key → `POST /api/push/subscriptions`. Success → **on**.
2. **on** — filled bell, tap unsubscribes: `subscription.unsubscribe()` + `DELETE`.
   → **off**.
3. **blocked** — permission previously denied. Tap shows a short note ("Notifications
   are blocked for this site in your browser settings").
4. **ios-install** — on iOS Safari outside standalone display mode the push API is
   absent; the bell still renders, and tapping opens the existing `Sheet` with
   friendly instructions: "To get critter alerts: tap Share → Add to Home Screen,
   then open the app from your home screen and tap the bell."
5. **hidden** — non-iOS browser with no push support at all (old desktop): bell
   doesn't render.

Detection: `ios-install` = `navigator.standalone === false`-style iOS detection
(user agent/platform check) AND `!('PushManager' in window)`; initial on/off from
`pushManager.getSubscription()` at mount. All permission requests originate from the
tap (iOS requires a user gesture; nothing prompts on load).

Failure rollback: if the server POST fails after a local subscribe, unsubscribe
locally and stay **off** with the app's standard inline error styling — the bell
never shows a state the server doesn't have. If Natalie subscribes on her own phone
she gets her own echoes; that's her choice, no special-casing.

## Ops & config

- New env vars `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
  (`mailto:...`), documented in `.env.example` with a comment:
  generate once with `npx web-push generate-vapid-keys`; rotating keys invalidates
  every existing subscription, so treat them like the DB password.
- `docker-compose.yml` passes the three vars to the app service.
- New dependency: `web-push` (server-side only).
- README: new endpoints in the API list + a short "Push notifications" setup note
  including the iOS Add-to-Home-Screen caveat.

## Error handling

- Push delivery can never break the sightings API: notifier catches everything,
  logs non-prune failures, prunes on 404/410.
- Subscribe/unsubscribe routes use the shared validation helpers and error shapes.
- Client subscribe failures roll back to a truthful bell state (above).
- Unconfigured server: routes 503 `{ error: 'push disabled' }`; the client treats a
  503 from the key fetch as unsupported and hides the bell.

## Testing (house style)

- **Notifier unit** (fake store, stub transport, fixed clock): payload formatting
  (named vs unnamed, place/comment joins, emoji in title); freshness window
  boundaries (yesterday sends, two days ago doesn't); prune on 404/410 only;
  transient errors logged and swallowed; no-op when unconfigured; a transport that
  throws synchronously doesn't propagate.
- **Routes unit** (fake store): validation matrix (bad endpoint/keys/unknown
  fields), upsert semantics, idempotent DELETE, 503s when unconfigured.
- **Integration** (Testcontainers): subscription upsert-by-endpoint against real
  Postgres; `POST /api/sightings` with a stub transport delivers to stored
  subscriptions and prunes a 410 endpoint.
- **Client** (mocked `Notification`/`serviceWorker`/`PushManager` globals): bell
  state machine off↔on, blocked note, ios-install sheet trigger, rollback when the
  server POST fails, hidden when unsupported.
- Full suite, lint, typecheck, build green; CI green.

## Out of scope

Offline caching / precache · notification batching or digests · per-friend
preferences (quiet hours, critter filters) · photo in the notification · subscriber
management UI for Natalie · invite gating · retry queues.

## Definition of done

- iPhone flow: visit the site in Safari → tap the bell → instruction sheet → Add to
  Home Screen → open the app → tap the bell → permission prompt → subscribed. Natalie
  logs a sighting dated today → the phone shows "🦝 Natalie saw a …!" → tapping opens
  the app.
- Backdating a sighting to last week sends nothing.
- Unsubscribing via the bell stops notifications; a 410-expired subscription is
  pruned from the table after the next send.
- With VAPID vars unset, the stack runs as before and the bell stays hidden.
- Full suite, lint, typecheck, build green; CI green on the PR.
