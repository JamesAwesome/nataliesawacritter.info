# Sighting Likes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Public, anonymous, toggleable "likes" on sightings — heart + count in every sighting row and the detail view — deduped per device, rate-limited per IP, with DB load de-risked by an up-front optimization spike.

**Architecture:** New `sighting_likes` table with a `UNIQUE (sighting_id, device_id)` constraint (correctness), a public `POST/DELETE /api/sightings/:id/like` pair keyed by an `X-Device-Id` header (idempotent), counts derived via `LEFT JOIN … GROUP BY` in the list query (pending spike confirmation), and a client that owns its own device ID + liked-set in `localStorage` so the public GET stays uniform and cacheable.

**Tech Stack:** Express 5, Drizzle ORM/Postgres, express-rate-limit, React 19, vitest (projects: `client` jsdom / `unit` node / `integration` Testcontainers).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-16-sighting-likes-design.md`. App-only abuse baseline — **no Cloudflare dashboard changes, no Turnstile, no CSP changes**.
- Like routes are **public** (no `writeGate`). Everything else keeps its gates.
- Device ID travels **only** in the `X-Device-Id` header; never in the public GET.
- Dedup key: `UNIQUE (sighting_id, device_id)`. Both like and unlike are idempotent; both return `{ likeCount: number }`.
- Public like spam must not consume the authed-write budget: like routes get their own `likeLimiter` (`likePerMin`, default 40) and are **skipped** by `mutationLimiter`.
- No raw hex in TSX (design tokens only). Server imports use `.js` extensions; never import client `src/` from server.
- All commands run from `app/` unless stated. Raw vitest needs `NODE_OPTIONS=--no-experimental-webstorage`.
- Migrations: schema change → `pnpm db:generate --name <change>`; commit all of `app/drizzle/` incl. `meta/`.
- Visual changes gate on a real headless-Chrome render, not jsdom alone.
- Coverage gate (`pnpm test:coverage`) must stay above thresholds; every new module ships with tests.
- Work on branch `feat/sighting-likes`; ship as one squash-merged PR (auto-deploys on merge).

---

### Task 1: Optimization research spike (DECISION GATE)

Research only — no production code. Answers the spec's spike questions and picks the counting + caching strategy. **If findings contradict the hypothesis (derive-on-read LEFT JOIN + short Cache-Control), STOP and revise this plan with the human before Task 3.**

**Files:**
- Create: `docs/superpowers/specs/2026-07-16-sighting-likes-spike-findings.md`

**Interfaces:**
- Produces: a findings doc with (1) measured read frequency, (2) `EXPLAIN ANALYZE` results for strategies a/b/c at 1× and 100× volume, (3) the chosen counting strategy, (4) the caching decision (TTL seconds, or none).

- [ ] **Step 1: Document read frequency from code (no measurement rig needed)**

Read and record in the findings doc:
- `app/src/hooks/useSightings.ts` — fetches `GET /api/sightings` on mount and on `useVisibilityRefresh` (tab/PWA foreground). **No interval polling.**
- `app/public/sw.js` — push-only service worker, no fetch handler → no background refetch.
- `app/server/feed/buildFeed.ts` + its route — RSS readers poll `/feed.xml`; each hit runs `store.list()`.
- Conclusion to verify and write down: reads are human-paced (app opens/foregrounds) + RSS-reader-paced; there is no client polling loop.

- [ ] **Step 2: Stand up a scratch Postgres and seed 100× volume**

```bash
docker run --rm -d --name likes-spike -e POSTGRES_PASSWORD=spike -p 55432:5432 postgres:16
sleep 3
docker exec -i likes-spike psql -U postgres <<'SQL'
CREATE TABLE sightings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emoji text NOT NULL, sighted_on date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sighting_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sighting_id uuid NOT NULL REFERENCES sightings(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sighting_likes_sighting_device UNIQUE (sighting_id, device_id)
);
-- ~100x projected: 2,000 sightings, ~60,000 likes (0-60 per sighting)
INSERT INTO sightings (emoji, sighted_on)
SELECT '🦊', current_date - (g % 365) FROM generate_series(1, 2000) g;
INSERT INTO sighting_likes (sighting_id, device_id)
SELECT s.id, 'device-' || d
FROM sightings s, generate_series(1, 60) d
WHERE d <= (('x' || substr(md5(s.id::text), 1, 4))::bit(16)::int % 61);
ANALYZE;
SQL
```

- [ ] **Step 3: EXPLAIN ANALYZE the three strategies**

```bash
docker exec -i likes-spike psql -U postgres <<'SQL'
-- (a) derive per request: LEFT JOIN ... GROUP BY (the list query shape)
EXPLAIN ANALYZE
SELECT s.*, count(l.id)::int AS like_count
FROM sightings s LEFT JOIN sighting_likes l ON l.sighting_id = s.id
GROUP BY s.id ORDER BY s.sighted_on DESC, s.created_at DESC;

-- (b) page-scoped aggregate (200 ids, merged in app code)
EXPLAIN ANALYZE
SELECT sighting_id, count(*)::int FROM sighting_likes
WHERE sighting_id = ANY(ARRAY(SELECT id FROM sightings ORDER BY sighted_on DESC LIMIT 200))
GROUP BY sighting_id;

-- (c) baseline: the current list query with no counts (for comparison)
EXPLAIN ANALYZE
SELECT * FROM sightings ORDER BY sighted_on DESC, created_at DESC;
SQL
docker stop likes-spike
```

Record total execution times. Decision criteria (from spec): pick the simplest strategy whose cost is comfortably flat at 100×; prefer (a) + edge cache unless it shows a real hotspot (>~50ms added at 100×).

- [ ] **Step 4: Decide caching and write the findings doc**

Write `docs/superpowers/specs/2026-07-16-sighting-likes-spike-findings.md` with: read-frequency conclusion, the timing table, chosen strategy, and the `Cache-Control` decision — hypothesis: `public, max-age=15` on `GET /api/sightings` (uniform response; counts eventually-consistent ≤15s is acceptable; client reflects its own likes optimistically). Note explicitly that write routes stay uncached.

- [ ] **Step 5: Gate check + commit**

If the chosen strategy is NOT (a) or caching is rejected: STOP, revise Tasks 3 and 7 with the human. Otherwise:

```bash
git add docs/superpowers/specs/2026-07-16-sighting-likes-spike-findings.md docs/superpowers/specs/2026-07-16-sighting-likes-design.md docs/superpowers/plans/2026-07-16-sighting-likes.md
git commit -m "docs: sighting-likes spec, plan, and optimization spike findings"
```

---

### Task 2: `sighting_likes` schema, migration, and likes store

**Files:**
- Modify: `app/server/db/schema.ts`
- Create: `app/server/likes/store.ts`
- Create: `app/server/likes/store.integration.test.ts`
- Generated: `app/drizzle/****_add-sighting-likes.sql` + `meta/`

**Interfaces:**
- Consumes: `createTestDb()` from `server/testDb.ts`; `createSightingsStore` for FK fixtures.
- Produces: `sightingLikes` table; `createLikesStore(db)` → `{ like(sightingId: string, deviceId: string): Promise<void>; unlike(sightingId: string, deviceId: string): Promise<void>; countFor(sightingId: string): Promise<number> }`; `type LikesStore = ReturnType<typeof createLikesStore>`.

- [ ] **Step 1: Add the table to `server/db/schema.ts`**

Add `unique` to the existing `drizzle-orm/pg-core` import, then append:

```ts
export const sightingLikes = pgTable(
  'sighting_likes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sightingId: uuid('sighting_id')
      .notNull()
      .references(() => sightings.id, { onDelete: 'cascade' }),
    // Anonymous per-browser id (client-generated UUID) — dedup key, never PII.
    deviceId: text('device_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // sighting_id leads, so this unique index also serves COUNT ... GROUP BY sighting_id.
  (t) => ({ uniqDeviceSighting: unique('sighting_likes_sighting_device').on(t.sightingId, t.deviceId) }),
)
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm db:generate --name add-sighting-likes`
Expected: a new SQL file under `app/drizzle/` creating `sighting_likes` with the unique constraint + updated `meta/`. Inspect the SQL confirms `ON DELETE cascade` and the `UNIQUE`.

- [ ] **Step 3: Write the failing integration tests**

`app/server/likes/store.integration.test.ts`:

```ts
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { createTestDb } from '../testDb.js'
import { createSightingsStore } from '../sightings/store.js'
import { createLikesStore } from './store.js'

let handle: Awaited<ReturnType<typeof createTestDb>>
let sightings: ReturnType<typeof createSightingsStore>
let likes: ReturnType<typeof createLikesStore>

beforeAll(async () => {
  handle = await createTestDb()
  sightings = createSightingsStore(handle.db)
  likes = createLikesStore(handle.db)
})
afterAll(async () => {
  await handle.close()
})

const FIELDS = {
  emoji: '🦊', sightedOn: '2026-07-16', name: null,
  sightedTime: null, place: null, comment: null, quantity: '1' as const,
}
const DEV_A = '11111111-1111-4111-8111-111111111111'
const DEV_B = '22222222-2222-4222-8222-222222222222'

describe('likes store', () => {
  it('counts one like per device — re-liking is a no-op (unique constraint)', async () => {
    const s = await sightings.create(FIELDS)
    await likes.like(s.id, DEV_A)
    await likes.like(s.id, DEV_A) // duplicate → ON CONFLICT DO NOTHING
    expect(await likes.countFor(s.id)).toBe(1)
    await likes.like(s.id, DEV_B)
    expect(await likes.countFor(s.id)).toBe(2)
  })

  it('unlike removes only that device’s like and is idempotent', async () => {
    const s = await sightings.create(FIELDS)
    await likes.like(s.id, DEV_A)
    await likes.like(s.id, DEV_B)
    await likes.unlike(s.id, DEV_A)
    await likes.unlike(s.id, DEV_A) // second unlike: no-op
    expect(await likes.countFor(s.id)).toBe(1)
  })

  it('cascades away when the sighting is deleted', async () => {
    const s = await sightings.create(FIELDS)
    await likes.like(s.id, DEV_A)
    await sightings.remove(s.id)
    expect(await likes.countFor(s.id)).toBe(0)
  })

  it('countFor is 0 for a sighting with no likes', async () => {
    const s = await sightings.create(FIELDS)
    expect(await likes.countFor(s.id)).toBe(0)
  })
})
```

- [ ] **Step 4: Run to verify failure**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project integration server/likes/store.integration.test.ts`
Expected: FAIL — `Cannot find module './store.js'`. (Needs Docker running.)

- [ ] **Step 5: Implement `server/likes/store.ts`**

```ts
import { and, eq, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '../db/schema.js'
import { sightingLikes } from '../db/schema.js'

export function createLikesStore(db: NodePgDatabase<typeof schema>) {
  return {
    /** Idempotent: the (sightingId, deviceId) unique constraint makes a repeat like a no-op. */
    async like(sightingId: string, deviceId: string): Promise<void> {
      await db.insert(sightingLikes).values({ sightingId, deviceId }).onConflictDoNothing()
    },

    async unlike(sightingId: string, deviceId: string): Promise<void> {
      await db
        .delete(sightingLikes)
        .where(and(eq(sightingLikes.sightingId, sightingId), eq(sightingLikes.deviceId, deviceId)))
    },

    async countFor(sightingId: string): Promise<number> {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(sightingLikes)
        .where(eq(sightingLikes.sightingId, sightingId))
      return row.count
    },
  }
}

export type LikesStore = ReturnType<typeof createLikesStore>
```

- [ ] **Step 6: Run to verify pass**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project integration server/likes/store.integration.test.ts`
Expected: 4 passed.

- [ ] **Step 7: Commit**

```bash
git add app/server/db/schema.ts app/drizzle app/server/likes/store.ts app/server/likes/store.integration.test.ts
git commit -m "feat: sighting_likes table + likes store (dedup via unique constraint)"
```

---

### Task 3: `likeCount` in the read API

Store list gains the count via `LEFT JOIN … GROUP BY` (per spike); create/photo responses stay shape-consistent.

**Files:**
- Modify: `app/server/sightings/store.ts` (list query + type)
- Modify: `app/server/sightings/routes.ts` (POST response)
- Modify: `app/server/sightings/photoRoutes.ts` (PUT response)
- Modify: `app/server/app.ts` (thread `countLikes` into the photo router)
- Modify: `app/src/api.ts` (client type)
- Modify: `app/src/test/helpers.ts` (`makeSighting` gains `likeCount: 0`)
- Test: `app/server/sightings/store.integration.test.ts`, `app/server/sightings/routes.test.ts`, `app/server/sightings/photoRoutes.test.ts`

**Interfaces:**
- Consumes: `sightingLikes` from Task 2.
- Produces: `type SightingWithLikes = Sighting & { likeCount: number }` (exported from `server/sightings/store.ts`); `store.list()` returns `Promise<SightingWithLikes[]>`; `sightingPhotoRouter` gains a 5th param `countLikes: (id: string) => Promise<number>`; client `Sighting` type gains `likeCount: number`.

- [ ] **Step 1: Failing integration test — list carries counts**

Append to `app/server/sightings/store.integration.test.ts` (match the file's existing setup style):

```ts
it('list() includes likeCount per sighting (0 when unliked)', async () => {
  const liked = await store.create({ ...FIELDS, name: 'Liked' })
  const unliked = await store.create({ ...FIELDS, name: 'Unliked' })
  const likes = createLikesStore(handle.db)
  await likes.like(liked.id, '33333333-3333-4333-8333-333333333333')

  const rows = await store.list()
  expect(rows.find((r) => r.id === liked.id)?.likeCount).toBe(1)
  expect(rows.find((r) => r.id === unliked.id)?.likeCount).toBe(0)
})
```

(Import `createLikesStore` from `../likes/store.js`; reuse the file's existing `FIELDS`/fixture naming — read the file first and adapt names to what's there.)

- [ ] **Step 2: Run to verify failure**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project integration server/sightings/store.integration.test.ts`
Expected: FAIL — `likeCount` is `undefined` (property doesn't exist), plus a type error on `likeCount`.

- [ ] **Step 3: Implement the joined list query in `server/sightings/store.ts`**

```ts
import { and, desc, eq, getTableColumns, gte, lte, sql } from 'drizzle-orm'
// ...
import { sightingLikes, sightings } from '../db/schema.js'

export type Sighting = typeof sightings.$inferSelect
/** A sighting as the read API serves it: row + derived like count. */
export type SightingWithLikes = Sighting & { likeCount: number }
```

Replace `list` with:

```ts
async list(range: { from?: string; to?: string } = {}): Promise<SightingWithLikes[]> {
  const conditions = []
  if (range.from !== undefined) conditions.push(gte(sightings.sightedOn, range.from))
  if (range.to !== undefined) conditions.push(lte(sightings.sightedOn, range.to))
  // Derived count (spike-validated): the (sighting_id, device_id) unique index
  // serves the GROUP BY; no denormalized counter to drift.
  return db
    .select({ ...getTableColumns(sightings), likeCount: sql<number>`count(${sightingLikes.id})::int` })
    .from(sightings)
    .leftJoin(sightingLikes, eq(sightingLikes.sightingId, sightings.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(sightings.id)
    .orderBy(desc(sightings.sightedOn), desc(sightings.createdAt))
},
```

- [ ] **Step 4: Keep create/photo responses shape-consistent**

`server/sightings/routes.ts` POST handler — a brand-new sighting has no likes:

```ts
const created = await store.create(parsed.fields)
onCreated(created, parsed.hasPhoto)
res.status(201).json({ ...created, likeCount: 0 })
```

`server/sightings/photoRoutes.ts` — add the param (default keeps old callers compiling) and include the count in the PUT response:

```ts
export function sightingPhotoRouter(
  store: SightingsStore,
  writeGate: RequestHandler,
  photosDir: string,
  onPhotoAttached: (sighting: Sighting) => void = () => {},
  countLikes: (id: string) => Promise<number> = async () => 0,
): Router {
```

and where the PUT responds: `res.json({ ...updated, likeCount: await countLikes(id) })` (place after `onPhotoAttached(updated)`).

`server/app.ts` — this wiring lands fully in Task 4 (the app doesn't have a likes store yet); for now pass nothing (default `0` applies). Note it in the Task 4 checklist.

- [ ] **Step 5: Failing-then-passing route tests**

`server/sightings/routes.test.ts` — extend the existing "201s a valid full body" test's assertions:

```ts
expect(((await res.json()) as SightingJson & { likeCount: number }).likeCount).toBe(0)
```

`server/sightings/photoRoutes.test.ts` — extend the existing PUT success test: build the app with a stub counter and assert it flows through:

```ts
// appWith gains: countLikes: (id: string) => Promise<number> = async () => 0
// in the success test:
const app = appWith(store, passGate, vi.fn(), async () => 7)
// ... after the PUT:
expect(((await res.json()) as { likeCount: number }).likeCount).toBe(7)
```

(Adapt `appWith` in that file to pass the new 5th param through.)

- [ ] **Step 6: Client type + helper**

`app/src/api.ts` — add to the `Sighting` type: `likeCount: number`.
`app/src/test/helpers.ts` — add `likeCount: 0` to the object `makeSighting` returns (grep for `photoPath` in that file to find the row literal).

- [ ] **Step 7: Run everything**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project unit --project client` then `--project integration server/sightings`, plus `pnpm typecheck && pnpm lint`.
Expected: all green (RSS `buildFeed` and client compile untouched — `SightingWithLikes` is a supertype; client tests may surface `likeCount` gaps in fixtures — fix by using `makeSighting`).

- [ ] **Step 8: Commit**

```bash
git add app/server/sightings app/server/app.ts app/src/api.ts app/src/test/helpers.ts
git commit -m "feat: likeCount derived in the sightings read API"
```

---

### Task 4: Public like/unlike routes + rate limiting

**Files:**
- Create: `app/server/likes/routes.ts`
- Create: `app/server/likes/routes.test.ts`
- Modify: `app/server/app.ts` (deps, `likeLimiter`, `mutationLimiter` skip, mounting, photo `countLikes`)
- Modify: server composition root (grep `createSightingsStore(` under `server/` — likely `server/index.ts`/`main.ts`) to build `createLikesStore` and pass it in deps.
- Test: `app/server/app.test.ts` additions if that file asserts limiter behavior (read it; extend in kind).

**Interfaces:**
- Consumes: `LikesStore` (Task 2), `SightingsStore.getById`, `UUID_RE`/`sendValidation` from `server/httpValidation.js`.
- Produces: `likesRouter(likesStore: LikesStore, sightingsStore: SightingsStore, limiter: RequestHandler): Router` mounting `POST /:id/like` and `DELETE /:id/like`; `AppDeps.likesStore: LikesStore`; `AppDeps.rateLimits` gains optional `likePerMin?: number` (default 40).

- [ ] **Step 1: Write failing route tests** (`app/server/likes/routes.test.ts`, unit project — mirror the fake-store + `withServer` style of `server/sightings/routes.test.ts`):

```ts
import express, { type Express } from 'express'
import { describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../errorHandler.js'
import { withServer } from '../testUtils.js'
import type { LikesStore } from './store.js'
import { likesRouter } from './routes.js'

const SID = '3f9a26cc-1c0e-4c3a-9b52-08a1c2f4d9aa'
const DEV = '11111111-1111-4111-8111-111111111111'

function fakeLikes(overrides: Partial<LikesStore> = {}): LikesStore {
  return { like: vi.fn(async () => {}), unlike: vi.fn(async () => {}), countFor: vi.fn(async () => 3), ...overrides }
}
const sightingExists = { getById: vi.fn(async () => ({ id: SID })) } as never
const sightingMissing = { getById: vi.fn(async () => null) } as never
const noLimit: express.RequestHandler = (_q, _s, next) => next()

function appWith(likes: LikesStore, sightings = sightingExists): Express {
  const app = express()
  app.use('/api/sightings', likesRouter(likes, sightings, noLimit))
  app.use(errorHandler)
  return app
}
const hit = (base: string, method: 'POST' | 'DELETE', id = SID, dev: string | null = DEV) =>
  fetch(`${base}/api/sightings/${id}/like`, { method, headers: dev === null ? {} : { 'X-Device-Id': dev } })

describe('like routes', () => {
  it('POST likes idempotently and returns the count (public: no auth header sent)', async () => {
    const likes = fakeLikes()
    await withServer(appWith(likes), async (base) => {
      const res = await hit(base, 'POST')
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ likeCount: 3 })
      expect(likes.like).toHaveBeenCalledWith(SID, DEV)
    })
  })

  it('DELETE unlikes and returns the count', async () => {
    const likes = fakeLikes()
    await withServer(appWith(likes), async (base) => {
      const res = await hit(base, 'DELETE')
      expect(res.status).toBe(200)
      expect(likes.unlike).toHaveBeenCalledWith(SID, DEV)
    })
  })

  it.each([
    ['bad sighting id', 'not-a-uuid', DEV],
    ['missing X-Device-Id', SID, null],
    ['bad X-Device-Id', SID, 'garbage'],
  ])('400s on %s without touching the store', async (_l, id, dev) => {
    const likes = fakeLikes()
    await withServer(appWith(likes), async (base) => {
      expect((await hit(base, 'POST', id as string, dev as string | null)).status).toBe(400)
      expect(likes.like).not.toHaveBeenCalled()
    })
  })

  it('404s an unknown sighting', async () => {
    await withServer(appWith(fakeLikes(), sightingMissing), async (base) => {
      expect((await hit(base, 'POST')).status).toBe(404)
    })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project unit server/likes/routes.test.ts`
Expected: FAIL — `likesRouter` not found.

- [ ] **Step 3: Implement `server/likes/routes.ts`**

```ts
import { Router, type RequestHandler } from 'express'
import { UUID_RE, sendValidation } from '../httpValidation.js'
import type { SightingsStore } from '../sightings/store.js'
import type { LikesStore } from './store.js'

/** Public like/unlike. No writeGate by design: likes are the app's one open
 *  write. Correctness comes from the (sighting, device) unique constraint;
 *  velocity from the per-IP limiter passed in. */
export function likesRouter(likes: LikesStore, sightings: SightingsStore, limiter: RequestHandler): Router {
  const router = Router()

  const handler =
    (action: 'like' | 'unlike'): RequestHandler =>
    async (req, res) => {
      const { id } = req.params as { id: string }
      const deviceId = req.get('X-Device-Id')
      const details: Record<string, string> = {}
      if (!UUID_RE.test(id)) details.id = 'must be a uuid'
      if (deviceId === undefined || !UUID_RE.test(deviceId)) details.deviceId = 'X-Device-Id header must be a uuid'
      if (Object.keys(details).length > 0) {
        sendValidation(res, details)
        return
      }
      if ((await sightings.getById(id)) === null) {
        res.status(404).json({ error: 'not found' })
        return
      }
      if (action === 'like') await likes.like(id, deviceId as string)
      else await likes.unlike(id, deviceId as string)
      res.json({ likeCount: await likes.countFor(id) })
    }

  router.post('/:id/like', limiter, handler('like'))
  router.delete('/:id/like', limiter, handler('unlike'))
  return router
}
```

- [ ] **Step 4: Run to verify pass** — same command as Step 2. Expected: all pass.

- [ ] **Step 5: Wire into `server/app.ts`**

- `AppDeps`: add `likesStore: LikesStore` and widen `rateLimits?: { authPerMin: number; mutationPerMin: number; likePerMin?: number }`.
- Defaults: `const limits = deps.rateLimits ?? { authPerMin: 10, mutationPerMin: 30 }` → after it add `const likePerMin = limits.likePerMin ?? 40`.
- New limiter next to the others:

```ts
// Likes are the one public write; give them their own budget so anonymous
// like traffic can never exhaust the authed-write (mutation) budget.
const LIKE_PATH_RE = /^\/api\/sightings\/[0-9a-f-]{36}\/like$/i
const likeLimiter = rateLimit({
  windowMs: 60_000,
  limit: likePerMin,
  keyGenerator: clientKey,
  standardHeaders: true,
  legacyHeaders: false,
  validate,
})
```

- `mutationLimiter`'s skip becomes: `skip: (req) => req.method === 'GET' || LIKE_PATH_RE.test(req.path),`
- Mount (any order relative to the other `/api/sightings` routers — paths don't overlap): `app.use('/api/sightings', likesRouter(deps.likesStore, deps.sightingsStore, likeLimiter))`
- Photo router now gets the real counter (from Task 3's param): `sightingPhotoRouter(deps.sightingsStore, writeGate, deps.photosDir, sightingNotify.onPhotoAttached, (id) => deps.likesStore.countFor(id))`

- [ ] **Step 6: Composition root + test fixtures**

- In the server entrypoint (grep `createSightingsStore(` under `server/`), add `import { createLikesStore } from './likes/store.js'` and `likesStore: createLikesStore(handle.db)` (match however the other stores are constructed/passed).
- Any `createApp({...})` fixtures in tests (grep `likesStore` type errors after typecheck) get `likesStore: fakeLikes()`-style stubs.

- [ ] **Step 7: Full unit + typecheck + lint**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project unit && pnpm typecheck && pnpm lint`
Expected: green.

- [ ] **Step 8: Commit**

```bash
git add app/server
git commit -m "feat: public like/unlike routes with dedicated per-IP limiter"
```

---

### Task 5: Client likes library + API functions

**Files:**
- Create: `app/src/lib/likes.ts`
- Create: `app/src/lib/likes.test.ts`
- Modify: `app/src/api.ts`

**Interfaces:**
- Produces: `deviceId(): string`; `hasLiked(id: string): boolean`; `markLiked(id: string): void`; `markUnliked(id: string): void` (all localStorage-backed); `likeSighting(id: string, deviceId: string): Promise<{ likeCount: number }>` and `unlikeSighting(id, deviceId)` in `api.ts`.

- [ ] **Step 1: Write failing tests** (`app/src/lib/likes.test.ts`, client project — jsdom has localStorage):

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { deviceId, hasLiked, markLiked, markUnliked } from './likes'

beforeEach(() => localStorage.clear())

describe('deviceId', () => {
  it('mints a UUID once and returns the same one after', () => {
    const first = deviceId()
    expect(first).toMatch(/^[0-9a-f-]{36}$/)
    expect(deviceId()).toBe(first)
  })
})

describe('liked set', () => {
  it('round-trips liked state and survives a reload (re-read from storage)', () => {
    expect(hasLiked('a')).toBe(false)
    markLiked('a')
    expect(hasLiked('a')).toBe(true)
    markUnliked('a')
    expect(hasLiked('a')).toBe(false)
  })

  it('tolerates corrupt storage', () => {
    localStorage.setItem('nac-liked', '{not json')
    expect(hasLiked('a')).toBe(false)
    markLiked('a') // must not throw; resets cleanly
    expect(hasLiked('a')).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client src/lib/likes.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/likes.ts`**

```ts
// The visitor's like identity and memory. The server owns counts (deduped by
// device); this browser owns "which sightings did *I* like" — keeping the
// public GET uniform and cacheable. See the sighting-likes design spec.
const DEVICE_KEY = 'nac-device-id'
const LIKED_KEY = 'nac-liked'

export function deviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY)
  if (id === null) {
    id = crypto.randomUUID()
    localStorage.setItem(DEVICE_KEY, id)
  }
  return id
}

function likedSet(): Set<string> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(LIKED_KEY) ?? '[]')
    return new Set(Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : [])
  } catch {
    return new Set()
  }
}

function save(set: Set<string>): void {
  localStorage.setItem(LIKED_KEY, JSON.stringify([...set]))
}

export function hasLiked(id: string): boolean {
  return likedSet().has(id)
}

export function markLiked(id: string): void {
  const set = likedSet()
  set.add(id)
  save(set)
}

export function markUnliked(id: string): void {
  const set = likedSet()
  set.delete(id)
  save(set)
}
```

- [ ] **Step 4: API functions in `src/api.ts`**

```ts
export async function likeSighting(id: string, deviceId: string): Promise<{ likeCount: number }> {
  const res = await fetch(`/api/sightings/${id}/like`, { method: 'POST', headers: { 'X-Device-Id': deviceId } })
  if (!res.ok) throw new ApiError(res.status)
  return (await res.json()) as { likeCount: number }
}

export async function unlikeSighting(id: string, deviceId: string): Promise<{ likeCount: number }> {
  const res = await fetch(`/api/sightings/${id}/like`, { method: 'DELETE', headers: { 'X-Device-Id': deviceId } })
  if (!res.ok) throw new ApiError(res.status)
  return (await res.json()) as { likeCount: number }
}
```

- [ ] **Step 5: Run to verify pass** — Step 2's command. Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add app/src/lib/likes.ts app/src/lib/likes.test.ts app/src/api.ts
git commit -m "feat: client device-id + liked-set library and like API calls"
```

---

### Task 6: Heart UI — row restructure, detail heart, optimistic toggle

**Files:**
- Modify: `app/src/components/SightingRow.tsx` (+ its test)
- Modify: `app/src/App.tsx` (own `toggleLike`, thread it)
- Modify: `app/src/components/HistoryPane.tsx`, `RecentCritters.tsx`, `DayDetail.tsx`, `SightingDetail.tsx` (thread `onToggleLike`; detail renders its own heart)
- Modify: `app/src/index.css` (`.row-open`, `.like-button`, `.like-count`)
- Test: `app/src/components/SightingRow.test.tsx`; render-gate screenshot

**Interfaces:**
- Consumes: `hasLiked/markLiked/markUnliked/deviceId` (Task 5), `likeSighting/unlikeSighting` (Task 5), `useSightings().applySighting` (exists), `Sighting.likeCount` (Task 3).
- Produces: `SightingRow` prop `onToggleLike?: (s: Sighting) => void`; App-level `toggleLike(s: Sighting): Promise<void>`.

- [ ] **Step 1: Write failing SightingRow tests** (append to `SightingRow.test.tsx`):

```tsx
import { hasLiked, markLiked } from '../lib/likes'

describe('like button', () => {
  beforeEach(() => localStorage.clear())

  it('renders heart + count as a separate control from the row-open button', async () => {
    const onSelect = vi.fn()
    const onToggleLike = vi.fn()
    const s = makeSighting({ name: 'Mr Fox', likeCount: 2 })
    render(<ul><SightingRow sighting={s} onSelect={onSelect} onToggleLike={onToggleLike} /></ul>)

    const like = screen.getByRole('button', { name: 'Like Mr Fox' })
    expect(like).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('2')).toBeInTheDocument()
    // separate controls: liking must not open the sighting
    await userEvent.click(like)
    expect(onToggleLike).toHaveBeenCalledWith(s)
    expect(onSelect).not.toHaveBeenCalled()
    // no nesting (a11y): the like button is not inside the open button
    expect(screen.getByRole('button', { name: /Mr Fox,/ }).contains(like)).toBe(false)
  })

  it('shows a filled pressed heart when this device liked it, and hides a 0 count', () => {
    const s = makeSighting({ name: 'Mr Fox', likeCount: 0 })
    markLiked(s.id)
    render(<ul><SightingRow sighting={s} onToggleLike={vi.fn()} /></ul>)
    expect(screen.getByRole('button', { name: 'Unlike Mr Fox' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('renders no like button without onToggleLike', () => {
    render(<ul><SightingRow sighting={makeSighting({ likeCount: 5 })} onSelect={vi.fn()} /></ul>)
    expect(screen.queryByRole('button', { name: /like/i })).not.toBeInTheDocument()
  })
})
```

(Adjust the open-button name regex to the row's real accessible name once running; import `userEvent`/`beforeEach` as needed.)

- [ ] **Step 2: Run to verify failure**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client src/components/SightingRow.test.tsx`
Expected: FAIL — no like button rendered.

- [ ] **Step 3: Restructure `SightingRow.tsx`**

```tsx
import { hasLiked } from '../lib/likes'
// Props gains: onToggleLike?: (sighting: Sighting) => void

export function SightingRow({ sighting, onSelect, starred, onToggleLike }: Props) {
  const displayName = sighting.name ?? (nameFor(sighting.emoji) ?? sighting.emoji)
  const liked = onToggleLike !== undefined && hasLiked(sighting.id)
  const body = (/* unchanged inner spans */)

  return (
    <li className="recent-row">
      {onSelect === undefined ? (
        <div className="row-open">{body}</div>
      ) : (
        <button type="button" className="row-open" onClick={() => onSelect(sighting.id)}>
          {body}
        </button>
      )}
      {onToggleLike !== undefined && (
        <button
          type="button"
          className={liked ? 'like-button liked' : 'like-button'}
          aria-pressed={liked}
          aria-label={liked ? `Unlike ${displayName}` : `Like ${displayName}`}
          onClick={() => onToggleLike(sighting)}
        >
          <span aria-hidden="true">{liked ? '❤️' : '🤍'}</span>
          {sighting.likeCount > 0 && <span className="like-count">{sighting.likeCount}</span>}
        </button>
      )}
    </li>
  )
}
```

Note the `li` is now always `recent-row` (the card); the open target moves to `.row-open`. Update CSS in `src/index.css`:

```css
/* Row card: was sometimes the button itself; now always the <li>, holding two
   sibling controls (open target + like button) so neither nests in the other. */
.row-open {
  all: unset;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
  cursor: pointer;
}
.like-button {
  border: none;
  background: none;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border-radius: 10px;
  font-size: 15px;
  cursor: pointer;
}
.like-count {
  font-size: 12px;
  font-weight: 700;
  color: var(--ink-secondary);
}
```

Migrate whatever `.row-button` carried (hover/focus states — read the block at `src/index.css:831`) onto `.recent-row`/`.row-open` so History/Recent/DayDetail rows keep their look; delete `.row-button` once nothing references it (grep first).

- [ ] **Step 4: Run to verify pass** — Step 2's command, plus the other row-consumer tests: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client`. Fix fallout in `HistoryPane`/`RecentCritters`/`DayDetail` tests (row markup changed).

- [ ] **Step 5: App-level optimistic toggle + threading**

In `App.tsx` (where `useSightings()` already provides `applySighting`):

```tsx
import { deviceId, hasLiked, markLiked, markUnliked } from './lib/likes'
import { likeSighting, unlikeSighting } from './api'

const toggleLike = useCallback(
  async (s: Sighting) => {
    const liked = hasLiked(s.id)
    // optimistic: flip local heart + count now, reconcile with the server after
    if (liked) markUnliked(s.id)
    else markLiked(s.id)
    applySighting({ ...s, likeCount: Math.max(0, s.likeCount + (liked ? -1 : 1)) })
    try {
      const { likeCount } = liked
        ? await unlikeSighting(s.id, deviceId())
        : await likeSighting(s.id, deviceId())
      applySighting({ ...s, likeCount })
    } catch {
      if (liked) markLiked(s.id)
      else markUnliked(s.id)
      applySighting(s) // roll back
    }
  },
  [applySighting],
)
```

Thread `onToggleLike={toggleLike}` down the same paths `onSelect` already travels (grep `onSelect` in `App.tsx`, `HistoryPane.tsx`, `RecentCritters.tsx`, `CalendarPane.tsx`/`DayDetail.tsx`) — add an `onToggleLike?: (s: Sighting) => void` prop at each hop and pass it to `SightingRow`.

In `SightingDetail.tsx`, add the same like button (the Task's Step 3 JSX, minus the row wrapper) near the title block, driven by the same `onToggleLike` prop and the sighting it renders.

- [ ] **Step 6: Full client suite + typecheck + lint** — expect green; fix drift.

- [ ] **Step 7: Real-render gate (required — jsdom can't see layout)**

Build a static harness like previous row checks: copy a rendered row's HTML (open target + like button, one liked one not, one with count 12) into a scratch HTML file linking the real `app/src/index.css`, screenshot with headless Chrome at 390px wide, and **look at it**: heart right-aligned, count legible, row height unchanged, chevron still inside the open target, nothing wraps.

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
  --hide-scrollbars --allow-file-access-from-files --window-size=390,400 \
  --screenshot=/tmp/likes-row.png <harness.html>
```

- [ ] **Step 8: Commit**

```bash
git add app/src
git commit -m "feat: tappable heart + like count in sighting rows and detail"
```

---

### Task 7: Edge caching (per spike) + docs

**Only if Task 1 confirmed caching.** Default hypothesis: `Cache-Control: public, max-age=15` on the public list.

**Files:**
- Modify: `app/server/sightings/routes.ts` (GET handler)
- Test: `app/server/sightings/routes.test.ts`
- Modify: `README.md` (feature blurb + the Cloudflare escalation levers from the spec's "Deferred Cloudflare escalations")

- [ ] **Step 1: Failing test** — in the GET describe block of `routes.test.ts`:

```ts
it('serves the public list with a short edge-cache header', async () => {
  await withServer(appWith(fakeStore()), async (base) => {
    const res = await fetch(`${base}/api/sightings`)
    expect(res.headers.get('cache-control')).toBe('public, max-age=15')
  })
})
```

- [ ] **Step 2: Verify failure** — `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project unit server/sightings/routes.test.ts`. Expected: FAIL (header null).

- [ ] **Step 3: Implement** — in the GET `/` handler, before `res.json(...)`:

```ts
// Uniform public payload (device-independent by design), so Cloudflare's edge
// can absorb most reads; counts go eventually-consistent by ≤15s, which the
// optimistic client heart already papers over. Spike findings: docs/superpowers/
// specs/2026-07-16-sighting-likes-spike-findings.md
res.setHeader('Cache-Control', 'public, max-age=15')
```

- [ ] **Step 4: Verify pass** — Step 2's command; then the full gate: `pnpm test:coverage && pnpm lint && pnpm typecheck`.

- [ ] **Step 5: README** — add likes to the feature list; add a short "Likes: abuse posture" note stating the app-only baseline and naming the deferred Cloudflare levers (Bot Fight Mode, the free edge Rate Limiting rule on `/api/sightings/*/like`, Turnstile last).

- [ ] **Step 6: Commit + PR**

```bash
git add app/server/sightings README.md
git commit -m "feat: short edge-cache on the public sightings list + likes docs"
git push -u origin feat/sighting-likes
gh pr create --title "Sighting likes: public hearts with per-device dedup" --body "<summarize: spike findings, dedup, limiter, UI, cache>"
```

Wait for CI green; squash-merge (auto-deploys).

---

## Self-review (done at write time)

- **Spec coverage:** spike→T1, schema/dedup→T2, derived counts + uniform GET→T3, public routes + limiter split (incl. "likes can't starve authed writes")→T4, device-id/liked-set client split→T5, row restructure + optimistic toggle + a11y + render gate→T6, edge cache + CF-escalation docs→T7. Non-goals (RSS/leaderboard/Turnstile/sync) appear in no task. ✓
- **Placeholders:** none; every code step carries the code. Two deliberate "grep first, adapt in kind" spots (composition root, `onSelect` threading) name the exact grep and the exact addition. ✓
- **Type consistency:** `SightingWithLikes` (T3) feeds `likeCount` used in T5/T6; `LikesStore` (T2) matches `likesRouter` (T4) and `countLikes` threading (T3/T4); `deviceId()`/`hasLiked`/`markLiked`/`markUnliked` names match between T5 and T6. ✓
