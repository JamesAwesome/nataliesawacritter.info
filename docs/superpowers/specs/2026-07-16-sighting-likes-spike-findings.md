# Sighting Likes — Optimization Spike Findings

**Status:** spike complete. Hypothesis confirmed — proceeding to Task 3 as planned.
**Date:** 2026-07-16
**Companion to:** `docs/superpowers/specs/2026-07-16-sighting-likes-design.md`

## 1. Read-frequency conclusion (from code)

Read the client fetch paths and the RSS route:

- `app/src/hooks/useSightings.ts` — fetches `GET /api/sightings` once on mount
  (the effect with `[loadCount]`), and again via `useVisibilityRefresh`
  (`app/src/hooks/useVisibilityRefresh.ts`), which fires **only** on the
  `visibilitychange` DOM event transitioning to `visible` — i.e. when a tab or
  installed PWA is foregrounded after being backgrounded/suspended. **No
  `setInterval`/polling loop anywhere in the hook.**
- `app/public/sw.js` — a push-only service worker. It registers `push` and
  `notificationclick` listeners only; there is no `fetch` handler and no
  `caches`/background-sync usage, so the service worker never triggers a
  background refetch of `/api/sightings`.
- `app/server/feed/routes.ts` + `app/server/feed/buildFeed.ts` — `GET
  /feed.xml` calls `store.list()` (same underlying query as the sightings
  list) on every hit. RSS readers poll this on their own schedule (typically
  15–60 min per reader, entirely client-controlled, outside this app's code).

**Conclusion (verified):** reads of the public list are **human-paced**
(app open / PWA foreground) plus **RSS-reader-paced** (external, coarse
polling). There is no client-side polling loop and no service-worker
background refetch. This is a low, bursty read volume — not a hot path that
needs to survive sustained high QPS — which is exactly the profile edge
caching with a short TTL is good at flattening.

## 2. EXPLAIN ANALYZE timing table

Scratch Postgres: `docker run --rm -d --name likes-spike -e
POSTGRES_PASSWORD=spike -p 55432:5432 postgres:16` (port 55432 was free).
Schema and seed exactly as specified in the task brief. Ran each of the three
candidate queries at two volumes:

- **1×** (current-scale approximation): 20 sightings, 180 likes (≤15/sighting)
- **100×** (projected): 2,000 sightings, 58,564 likes (0–60/sighting,
  ~29 avg)

| Strategy | 1× execution time | 100× execution time | Δ vs baseline (100×) | Plan notes |
|---|---|---|---|---|
| (a) derive per request — `LEFT JOIN … GROUP BY` | 0.060 ms | **17.024 ms** | +16.66 ms | Seq scan both tables → hash right join → hash aggregate → sort. Full-table seq scans are expected/optimal here since the list query always returns every row (no `WHERE`) — nothing for an index to filter. |
| (b) page-scoped aggregate — `WHERE sighting_id = ANY($ids)` on 200 ids | 0.039 ms | **1.578 ms** | +1.22 ms | **Bitmap Index Scan on `sighting_likes_sighting_device`** — confirms the existing `UNIQUE(sighting_id, device_id)` index (sighting_id leading) serves this `GROUP BY sighting_id` with no extra index needed. |
| (c) baseline — current list query, no counts | 0.008 ms | **0.361 ms** | — | Seq scan + sort, unchanged from today. |

Notes:
- All timings are single-shot `EXPLAIN ANALYZE` execution times (warm
  container, ANALYZE run after seeding); not averaged over multiple runs, but
  the magnitudes are consistent with the plan shapes (no index misses, no
  spills to disk — all sorts/hashes fit in memory per the plan output).
- (b)'s `LIMIT 200` sub-select models pagination; the current app has no
  pagination (list returns all rows), so (a) is the shape that actually
  matches today's `GET /api/sightings` — (b) was measured per the brief's
  spec as an alternative reference point, not because the app pages.

## 3. Chosen counting strategy

**Strategy (a): derive per request** — `LEFT JOIN sighting_likes … GROUP BY
s.id` alongside the existing list query.

Rationale against the decision criteria ("pick the simplest strategy whose
cost is comfortably flat at 100×; prefer (a) + edge cache unless it shows a
real hotspot: >~50ms added at 100×"):

- At 100× projected volume (2,000 sightings / ~58k likes — a volume this app
  is not realistically close to reaching soon), (a) adds **~16.7ms**, well
  under the ~50ms hotspot threshold.
- 17ms total execution time is negligible against human-paced, bursty reads
  (Section 1) — there is no sustained-QPS scenario here that would compound
  this cost.
- (a) is the simplest option: one query, no page-merging logic in app code,
  no denormalized counter to keep in sync (no drift risk, matches the design
  doc's non-goal "Any denormalized like counter (derive until proven
  necessary)").
- (b) is measurably cheaper (1.58ms at 100×) and confirms the unique index
  is usable for a scoped aggregate, but it requires pagination (which
  `GET /api/sightings` doesn't have) and app-side merge logic — added
  complexity not justified by (a)'s already-comfortable numbers.
- (c) denormalized `like_count` column was not implemented/measured directly
  (no write-path exists yet to maintain it) — correctly deferred per the
  design doc; (a)'s headroom means there's no measured hotspot to justify
  the drift risk and write-path complexity of denormalization.

**No hotspot found → hypothesis confirmed. No STOP/revise needed; proceeding
to Task 3 (add `likeCount` to `GET /api/sightings` via strategy (a)).**

## 4. Caching decision

**`Cache-Control: public, max-age=15`** on `GET /api/sightings`.

- The public list response is deliberately device-independent (design doc:
  "Client owns 'my hearts'" — no device ID sent on reads, counts are the same
  for every viewer), so it is safe to cache uniformly at the edge
  (Cloudflare, already in front of the tunnel-only origin).
- A 15s TTL means the DB is hit at most ~once per 15s per edge PoP regardless
  of read volume — combined with Section 1's read profile (bursty, human- and
  RSS-paced, no polling loop), this makes strategy (a)'s already-small
  per-request cost even less relevant in practice.
- Trade-off accepted: a new sighting or a new/removed like can take up to 15s
  to appear in the public list for a visitor hitting a cached edge response.
  This is acceptable because:
  - The client already reflects a visitor's own like optimistically
    (design doc: "tapping fills the heart and adjusts the count immediately,
    then reconciles to the server's returned count") — a visitor never waits
    on cache staleness to see *their own* action reflected.
  - New-sighting latency of ≤15s is imperceptible against this app's
    human-paced usage pattern (nobody is watching the list in a tight loop).
- **Write routes stay uncached** — `POST/DELETE /api/sightings/:id/like`,
  `POST /api/sightings`, and `DELETE /api/sightings/:id` must not set
  `Cache-Control: public` (they're already behind `writeGate`/rate limiters
  for the mutation paths, and the like routes return the authoritative count
  directly in the response body — that response is per-request, not
  cacheable).
- No in-process count cache is needed as a fallback — edge caching is the
  single lever; nothing suggests it will be undesirable (no auth/personalization
  on this endpoint to conflict with a shared cache).

## Summary

| Question | Answer |
|---|---|
| Read frequency | Human-paced (mount + PWA foreground) + RSS-reader-paced; no client polling loop, no SW background fetch |
| Counting strategy | (a) derive per request — `LEFT JOIN … GROUP BY`, ~17ms at 100× volume, no index/schema changes needed |
| Caching | `Cache-Control: public, max-age=15` on `GET /api/sightings` only; write routes uncached |
| Gate outcome | Hypothesis confirmed — proceed to Task 3 as planned, no revision needed |
