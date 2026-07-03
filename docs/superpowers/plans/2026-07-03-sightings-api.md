# Sightings CRUD API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The three-endpoint sightings REST API (list/create/delete) with auth-gated writes, per `docs/superpowers/specs/2026-07-03-sightings-api-design.md`.

**Architecture:** A `store` module (pure Drizzle queries) and a `routes` module (validation + HTTP) under `app/server/sightings/`, wired into the existing `createApp` dependency-injection seam. Writes sit behind the existing timing-safe basic-auth middleware, or a 503 "writes disabled" handler when credentials are unset (deny by default). Express 5 forwards rejected handler promises to an error middleware that returns a sanitized 500.

**Tech Stack:** Express 5, Drizzle ORM 0.45 / pg, Vitest 4 (unit + Testcontainers integration), TypeScript 6, Node 26, pnpm 11.9.0.

**Spec:** `docs/superpowers/specs/2026-07-03-sightings-api-design.md`

## Global Constraints

- pnpm 11.9.0 only; run pnpm commands from `app/`.
- Server-side relative imports use `.js` extensions (resolve to `.ts` sources).
- Health contract unchanged; existing tests must stay green. Unit tests: `pnpm vitest run --project unit`; integration: `--project integration` (Docker required, postgres:18.4 via Testcontainers).
- API field names are camelCase; error envelopes exactly: `{"error":"validation","details":{<field>:<message>}}`, `{"error":"not found"}`, `{"error":"writes disabled"}`, `{"error":"internal"}`, `{"error":"unauthorized"}` (existing auth reject).
- Length caps in UTF-16 code units (`String.prototype.length`): emoji 16; name/sightedTime/place 100; comment 1000.
- No UI changes, no photo upload (`photoPath` stays null and is rejected as an unknown POST field), no PATCH.
- Working directory: the repo (or its worktree copy); paths below are repo-relative.

---

### Task 1: Auth hardening — empty-credential guard + missing-colon test

**Files:**
- Modify: `app/server/auth.ts` (add guard at top of `requireWriteAuth`)
- Test: `app/server/auth.test.ts` (append three tests)

**Interfaces:**
- Consumes: existing `requireWriteAuth(user, password): RequestHandler`, `withServer` from `app/server/testUtils.ts`
- Produces: `requireWriteAuth` now throws `Error('requireWriteAuth requires non-empty user and password')` when either argument is `''` — Task 4 relies on constructing it only with non-empty credentials.

- [ ] **Step 1: Append the failing tests**

Append inside the existing `describe('requireWriteAuth', ...)` block in `app/server/auth.test.ts`:

```ts
  it('rejects a Basic header whose payload has no colon', async () => {
    await withServer(appWithAuth(), async (base) => {
      const res = await fetch(`${base}/api/protected`, {
        method: 'POST',
        headers: { authorization: 'Basic ' + Buffer.from('nataliesekrit').toString('base64') },
      })
      expect(res.status).toBe(401)
    })
  })

  it('throws when constructed with an empty user', () => {
    expect(() => requireWriteAuth('', 'sekrit')).toThrow(/non-empty/)
  })

  it('throws when constructed with an empty password', () => {
    expect(() => requireWriteAuth('natalie', '')).toThrow(/non-empty/)
  })
```

- [ ] **Step 2: Run tests to verify the new ones fail/pass as expected**

Run (from `app/`): `pnpm vitest run --project unit`
Expected: missing-colon test PASSES already (the `separator < 0` branch exists — this closes a coverage gap, that's fine); the two constructor tests FAIL (nothing throws yet).

- [ ] **Step 3: Add the guard**

In `app/server/auth.ts`, add as the first lines of `requireWriteAuth`'s body (before the `return`):

```ts
  if (!user || !password) {
    throw new Error('requireWriteAuth requires non-empty user and password')
  }
```

- [ ] **Step 4: Run tests to verify all pass**

Run (from `app/`): `pnpm vitest run --project unit`
Expected: 11 passed (8 existing + 3 new).

- [ ] **Step 5: Lint, typecheck, commit**

```bash
pnpm lint && pnpm typecheck
git add app/server/auth.ts app/server/auth.test.ts
git commit -m "feat: reject empty basic-auth credentials at construction"
```

---

### Task 2: Sightings store (Testcontainers TDD)

**Files:**
- Create: `app/server/sightings/store.ts`
- Test: `app/server/sightings/store.integration.test.ts`

**Interfaces:**
- Consumes: `createDb` from `app/server/db/index.ts`; `sightings` table from `app/server/db/schema.ts`
- Produces (Tasks 3–5 rely on these exact shapes):

```ts
export type NewSighting = {
  emoji: string
  sightedOn: string
  name: string | null
  sightedTime: string | null
  place: string | null
  comment: string | null
}
export type Sighting = typeof sightings.$inferSelect
// { id: string; emoji: string; name: string | null; sightedOn: string;
//   sightedTime: string | null; place: string | null; comment: string | null;
//   photoPath: string | null; createdAt: Date }
export function createSightingsStore(db: NodePgDatabase<typeof schema>): {
  list(range?: { from?: string; to?: string }): Promise<Sighting[]>
  create(fields: NewSighting): Promise<Sighting>
  remove(id: string): Promise<boolean>  // false = no such row
}
export type SightingsStore = ReturnType<typeof createSightingsStore>
```

- [ ] **Step 1: Write the failing integration test**

`app/server/sightings/store.integration.test.ts`:

```ts
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../db/index.js'
import { sightings } from '../db/schema.js'
import { createSightingsStore, type SightingsStore } from './store.js'

describe('sightings store', () => {
  let container: StartedPostgreSqlContainer
  let handle: ReturnType<typeof createDb>
  let store: SightingsStore

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18.4').start()
    handle = createDb(container.getConnectionUri())
    await migrate(handle.db, { migrationsFolder: 'drizzle' })
    store = createSightingsStore(handle.db)
  })

  afterAll(async () => {
    await handle?.pool.end()
    await container?.stop()
  })

  beforeEach(async () => {
    await handle.db.delete(sightings)
  })

  const fox = (overrides: Partial<Parameters<SightingsStore['create']>[0]> = {}) => ({
    emoji: '🦊',
    sightedOn: '2026-07-02',
    name: 'Fox',
    sightedTime: null,
    place: null,
    comment: null,
    ...overrides,
  })

  it('create returns the persisted row with generated id and createdAt', async () => {
    const row = await store.create(fox({ place: 'backyard' }))
    expect(row.id).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27}$/)
    expect(row.createdAt).toBeInstanceOf(Date)
    expect(row.photoPath).toBeNull()
    expect(row.place).toBe('backyard')
  })

  it('list orders by sightedOn desc then createdAt desc', async () => {
    await store.create(fox({ sightedOn: '2026-07-01', name: 'oldest' }))
    const firstOfDay = await store.create(fox({ sightedOn: '2026-07-03', name: 'day-first' }))
    const secondOfDay = await store.create(fox({ sightedOn: '2026-07-03', name: 'day-second' }))
    await store.create(fox({ sightedOn: '2026-07-02', name: 'middle' }))
    expect(secondOfDay.createdAt.getTime()).toBeGreaterThanOrEqual(firstOfDay.createdAt.getTime())

    const names = (await store.list()).map((s) => s.name)
    expect(names).toEqual(['day-second', 'day-first', 'middle', 'oldest'])
  })

  it('filters by from/to inclusively, with open-ended bounds', async () => {
    await store.create(fox({ sightedOn: '2026-07-01', name: 'a' }))
    await store.create(fox({ sightedOn: '2026-07-02', name: 'b' }))
    await store.create(fox({ sightedOn: '2026-07-03', name: 'c' }))

    expect((await store.list({ from: '2026-07-02', to: '2026-07-03' })).map((s) => s.name)).toEqual(['c', 'b'])
    expect((await store.list({ from: '2026-07-02' })).map((s) => s.name)).toEqual(['c', 'b'])
    expect((await store.list({ to: '2026-07-01' })).map((s) => s.name)).toEqual(['a'])
    expect(await store.list({ from: '2026-07-04' })).toEqual([])
  })

  it('remove returns true for an existing row and false for a missing one', async () => {
    const row = await store.create(fox())
    expect(await store.remove(row.id)).toBe(true)
    expect(await store.list()).toEqual([])
    expect(await store.remove('00000000-0000-0000-0000-000000000000')).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `app/`): `pnpm vitest run --project integration`
Expected: FAIL — cannot resolve `./store.js`. (The existing db integration test still passes.)

- [ ] **Step 3: Implement the store**

`app/server/sightings/store.ts`:

```ts
import { and, desc, eq, gte, lte } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '../db/schema.js'
import { sightings } from '../db/schema.js'

export type NewSighting = {
  emoji: string
  sightedOn: string
  name: string | null
  sightedTime: string | null
  place: string | null
  comment: string | null
}

export type Sighting = typeof sightings.$inferSelect

export function createSightingsStore(db: NodePgDatabase<typeof schema>) {
  return {
    async list(range: { from?: string; to?: string } = {}): Promise<Sighting[]> {
      const conditions = []
      if (range.from !== undefined) conditions.push(gte(sightings.sightedOn, range.from))
      if (range.to !== undefined) conditions.push(lte(sightings.sightedOn, range.to))
      return db
        .select()
        .from(sightings)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(sightings.sightedOn), desc(sightings.createdAt))
    },

    async create(fields: NewSighting): Promise<Sighting> {
      const [row] = await db.insert(sightings).values(fields).returning()
      return row
    },

    async remove(id: string): Promise<boolean> {
      const removed = await db
        .delete(sightings)
        .where(eq(sightings.id, id))
        .returning({ id: sightings.id })
      return removed.length > 0
    },
  }
}

export type SightingsStore = ReturnType<typeof createSightingsStore>
```

- [ ] **Step 4: Run the integration project to verify it passes**

Run (from `app/`): `pnpm vitest run --project integration`
Expected: 2 files passing (existing db test + 4 new store tests).

Note: if the ordering test is flaky because two rows in the same transaction batch get identical `created_at` (`now()` is transaction-scoped, but each `create` is its own statement so timestamps should differ; `clock_timestamp` granularity is microseconds) — report it rather than loosening the assertion.

- [ ] **Step 5: Lint, typecheck, commit**

```bash
pnpm lint && pnpm typecheck
git add app/server/sightings
git commit -m "feat: add sightings store with range-filtered list, create, remove"
```

---

### Task 3: Router + validation (unit TDD, fake store)

**Files:**
- Create: `app/server/sightings/routes.ts`
- Test: `app/server/sightings/routes.test.ts`

**Interfaces:**
- Consumes: `NewSighting`, `Sighting`, `SightingsStore` types from `./store.js` (Task 2); `requireWriteAuth` (Task 1); `withServer` from `../testUtils.js`
- Produces: `sightingsRouter(store: SightingsStore, writeGate: RequestHandler): Router` from `app/server/sightings/routes.ts` — mounted by Task 4 at `/api/sightings`. Handlers may reject; the app-level error middleware (Task 4) turns that into a 500. Response contracts exactly per the spec (200 array / 201 row / 204 / 400 validation envelope / 404).

- [ ] **Step 1: Write the failing tests**

`app/server/sightings/routes.test.ts`:

```ts
import express, { type ErrorRequestHandler, type Express, type RequestHandler } from 'express'
import { describe, expect, it, vi } from 'vitest'
import { requireWriteAuth } from '../auth.js'
import { withServer } from '../testUtils.js'
import { sightingsRouter } from './routes.js'
import type { Sighting, SightingsStore } from './store.js'

const FIXED_ID = '3f9a26cc-1c0e-4c3a-9b52-08a1c2f4d9aa'

function rowFor(fields: Parameters<SightingsStore['create']>[0]): Sighting {
  return { ...fields, id: FIXED_ID, photoPath: null, createdAt: new Date('2026-07-03T12:00:00Z') }
}

function fakeStore(overrides: Partial<SightingsStore> = {}): SightingsStore {
  return {
    list: vi.fn(async () => []),
    create: vi.fn(async (fields) => rowFor(fields)),
    remove: vi.fn(async () => true),
    ...overrides,
  }
}

const passGate: RequestHandler = (_req, _res, next) => next()

function appWith(store: SightingsStore, gate: RequestHandler = passGate): Express {
  const app = express()
  app.use(express.json())
  app.use('/api/sightings', sightingsRouter(store, gate))
  // mirror the app-level error middleware so rejected handlers 500 in tests too
  app.use(((_err, _req, res, _next) => {
    res.status(500).json({ error: 'internal' })
  }) as ErrorRequestHandler)
  return app
}

const VALID = { emoji: '🦊', sightedOn: '2026-07-03' }

describe('GET /api/sightings', () => {
  it('returns the store list as JSON with ISO createdAt', async () => {
    const store = fakeStore({ list: vi.fn(async () => [rowFor({ ...VALID, name: 'Fox', sightedTime: null, place: null, comment: null })]) })
    await withServer(appWith(store), async (base) => {
      const res = await fetch(`${base}/api/sightings`)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toHaveLength(1)
      expect(body[0].id).toBe(FIXED_ID)
      expect(body[0].createdAt).toBe('2026-07-03T12:00:00.000Z')
      expect(store.list).toHaveBeenCalledWith({ from: undefined, to: undefined })
    })
  })

  it('passes from/to through to the store', async () => {
    const store = fakeStore()
    await withServer(appWith(store), async (base) => {
      const res = await fetch(`${base}/api/sightings?from=2026-07-01&to=2026-07-31`)
      expect(res.status).toBe(200)
      expect(store.list).toHaveBeenCalledWith({ from: '2026-07-01', to: '2026-07-31' })
    })
  })

  it.each([
    ['bad from', '?from=07/01/2026', 'from'],
    ['bad to', '?to=2026-13-01', 'to'],
    ['impossible date', '?from=2026-02-30', 'from'],
  ])('400s on %s', async (_label, query, field) => {
    await withServer(appWith(fakeStore()), async (base) => {
      const res = await fetch(`${base}/api/sightings${query}`)
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toBe('validation')
      expect(body.details[field]).toBe('must be YYYY-MM-DD')
    })
  })

  it('400s when from > to', async () => {
    await withServer(appWith(fakeStore()), async (base) => {
      const res = await fetch(`${base}/api/sightings?from=2026-07-31&to=2026-07-01`)
      expect(res.status).toBe(400)
      expect((await res.json()).details.from).toBe('must be on or before to')
    })
  })
})

describe('POST /api/sightings', () => {
  async function post(base: string, body: unknown) {
    return fetch(`${base}/api/sightings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  it('201s a valid full body and echoes the created row', async () => {
    const store = fakeStore()
    await withServer(appWith(store), async (base) => {
      const res = await post(base, { ...VALID, name: 'Fox', sightedTime: 'dusk', place: 'trail', comment: 'so fluffy' })
      expect(res.status).toBe(201)
      expect((await res.json()).id).toBe(FIXED_ID)
      expect(store.create).toHaveBeenCalledWith({
        emoji: '🦊', sightedOn: '2026-07-03', name: 'Fox', sightedTime: 'dusk', place: 'trail', comment: 'so fluffy',
      })
    })
  })

  it('normalizes omitted, null, and empty-string optionals to null', async () => {
    const store = fakeStore()
    await withServer(appWith(store), async (base) => {
      const res = await post(base, { ...VALID, name: '', sightedTime: null })
      expect(res.status).toBe(201)
      expect(store.create).toHaveBeenCalledWith({
        emoji: '🦊', sightedOn: '2026-07-03', name: null, sightedTime: null, place: null, comment: null,
      })
    })
  })

  it.each([
    ['missing emoji', { sightedOn: '2026-07-03' }, 'emoji'],
    ['empty emoji', { ...VALID, emoji: '' }, 'emoji'],
    ['emoji too long', { ...VALID, emoji: 'x'.repeat(17) }, 'emoji'],
    ['emoji wrong type', { ...VALID, emoji: 7 }, 'emoji'],
    ['missing sightedOn', { emoji: '🦊' }, 'sightedOn'],
    ['bad sightedOn format', { ...VALID, sightedOn: '07/03/2026' }, 'sightedOn'],
    ['impossible sightedOn', { ...VALID, sightedOn: '2026-02-30' }, 'sightedOn'],
    ['name too long', { ...VALID, name: 'x'.repeat(101) }, 'name'],
    ['name wrong type', { ...VALID, name: 42 }, 'name'],
    ['comment too long', { ...VALID, comment: 'x'.repeat(1001) }, 'comment'],
    ['unknown field photoPath', { ...VALID, photoPath: '/x.jpg' }, 'photoPath'],
    ['unknown field id', { ...VALID, id: FIXED_ID }, 'id'],
  ])('400s on %s', async (_label, body, field) => {
    const store = fakeStore()
    await withServer(appWith(store), async (base) => {
      const res = await post(base, body)
      expect(res.status).toBe(400)
      const parsed = await res.json()
      expect(parsed.error).toBe('validation')
      expect(parsed.details[field]).toBeDefined()
      expect(store.create).not.toHaveBeenCalled()
    })
  })

  it('aggregates multiple field errors in one response', async () => {
    await withServer(appWith(fakeStore()), async (base) => {
      const res = await post(base, { emoji: '', sightedOn: 'nope', extra: 1 })
      expect(res.status).toBe(400)
      const { details } = await res.json()
      expect(Object.keys(details).sort()).toEqual(['emoji', 'extra', 'sightedOn'])
    })
  })

  it('400s a non-object body', async () => {
    await withServer(appWith(fakeStore()), async (base) => {
      const res = await post(base, ['🦊'])
      expect(res.status).toBe(400)
    })
  })

  it('500s with a sanitized envelope when the store rejects', async () => {
    const store = fakeStore({ create: vi.fn(async () => { throw new Error('db down') }) })
    await withServer(appWith(store), async (base) => {
      const res = await post(base, VALID)
      expect(res.status).toBe(500)
      expect(await res.json()).toEqual({ error: 'internal' })
    })
  })
})

describe('DELETE /api/sightings/:id', () => {
  it('204s when the store removes the row', async () => {
    const store = fakeStore()
    await withServer(appWith(store), async (base) => {
      const res = await fetch(`${base}/api/sightings/${FIXED_ID}`, { method: 'DELETE' })
      expect(res.status).toBe(204)
      expect(store.remove).toHaveBeenCalledWith(FIXED_ID)
    })
  })

  it('404s when the store finds nothing', async () => {
    const store = fakeStore({ remove: vi.fn(async () => false) })
    await withServer(appWith(store), async (base) => {
      const res = await fetch(`${base}/api/sightings/${FIXED_ID}`, { method: 'DELETE' })
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ error: 'not found' })
    })
  })

  it('400s a non-uuid id without touching the store', async () => {
    const store = fakeStore()
    await withServer(appWith(store), async (base) => {
      const res = await fetch(`${base}/api/sightings/42`, { method: 'DELETE' })
      expect(res.status).toBe(400)
      expect((await res.json()).details.id).toBe('must be a uuid')
      expect(store.remove).not.toHaveBeenCalled()
    })
  })
})

describe('write gate', () => {
  const gated = () => appWith(fakeStore(), requireWriteAuth('natalie', 'sekrit'))
  const auth = 'Basic ' + Buffer.from('natalie:sekrit').toString('base64')

  it('GET is public even with a gate', async () => {
    await withServer(gated(), async (base) => {
      expect((await fetch(`${base}/api/sightings`)).status).toBe(200)
    })
  })

  it('POST and DELETE 401 without credentials', async () => {
    await withServer(gated(), async (base) => {
      const post = await fetch(`${base}/api/sightings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(VALID),
      })
      const del = await fetch(`${base}/api/sightings/${FIXED_ID}`, { method: 'DELETE' })
      expect(post.status).toBe(401)
      expect(del.status).toBe(401)
    })
  })

  it('POST succeeds with credentials', async () => {
    await withServer(gated(), async (base) => {
      const res = await fetch(`${base}/api/sightings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: auth },
        body: JSON.stringify(VALID),
      })
      expect(res.status).toBe(201)
    })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run (from `app/`): `pnpm vitest run --project unit`
Expected: FAIL — cannot resolve `./routes.js`. Auth/app/health tests still pass.

- [ ] **Step 3: Implement the router**

`app/server/sightings/routes.ts`:

```ts
import { Router, type RequestHandler, type Response } from 'express'
import type { NewSighting, SightingsStore } from './store.js'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isValidDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function sendValidation(res: Response, details: Record<string, string>) {
  res.status(400).json({ error: 'validation', details })
}

const OPTIONAL_LIMITS = { name: 100, sightedTime: 100, place: 100, comment: 1000 } as const
type OptionalField = keyof typeof OPTIONAL_LIMITS
const KNOWN_FIELDS = new Set(['emoji', 'sightedOn', ...Object.keys(OPTIONAL_LIMITS)])

function parseNewSighting(body: unknown):
  | { ok: true; fields: NewSighting }
  | { ok: false; details: Record<string, string> } {
  const details: Record<string, string> = {}
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, details: { body: 'must be a JSON object' } }
  }
  const record = body as Record<string, unknown>

  for (const key of Object.keys(record)) {
    if (!KNOWN_FIELDS.has(key)) details[key] = 'unknown field'
  }

  const emoji = record.emoji
  if (typeof emoji !== 'string' || emoji.length === 0 || emoji.length > 16) {
    details.emoji = 'required, 1-16 characters'
  }

  const sightedOn = record.sightedOn
  if (typeof sightedOn !== 'string' || !isValidDate(sightedOn)) {
    details.sightedOn = 'required, must be YYYY-MM-DD'
  }

  const optionals = {} as Record<OptionalField, string | null>
  for (const field of Object.keys(OPTIONAL_LIMITS) as OptionalField[]) {
    const value = record[field]
    if (value === undefined || value === null || value === '') {
      optionals[field] = null
    } else if (typeof value !== 'string' || value.length > OPTIONAL_LIMITS[field]) {
      details[field] = `must be a string of at most ${OPTIONAL_LIMITS[field]} characters`
    } else {
      optionals[field] = value
    }
  }

  if (Object.keys(details).length > 0) return { ok: false, details }
  return {
    ok: true,
    fields: { emoji: emoji as string, sightedOn: sightedOn as string, ...optionals },
  }
}

export function sightingsRouter(store: SightingsStore, writeGate: RequestHandler): Router {
  const router = Router()

  router.get('/', async (req, res) => {
    const details: Record<string, string> = {}
    const parseBound = (value: unknown, key: 'from' | 'to'): string | undefined => {
      if (value === undefined) return undefined
      if (typeof value !== 'string' || !isValidDate(value)) {
        details[key] = 'must be YYYY-MM-DD'
        return undefined
      }
      return value
    }
    const from = parseBound(req.query.from, 'from')
    const to = parseBound(req.query.to, 'to')
    if (from !== undefined && to !== undefined && from > to) {
      details.from = 'must be on or before to'
    }
    if (Object.keys(details).length > 0) {
      sendValidation(res, details)
      return
    }
    res.json(await store.list({ from, to }))
  })

  router.post('/', writeGate, async (req, res) => {
    const parsed = parseNewSighting(req.body)
    if (!parsed.ok) {
      sendValidation(res, parsed.details)
      return
    }
    res.status(201).json(await store.create(parsed.fields))
  })

  router.delete('/:id', writeGate, async (req, res) => {
    const { id } = req.params
    if (!UUID_RE.test(id)) {
      sendValidation(res, { id: 'must be a uuid' })
      return
    }
    const removed = await store.remove(id)
    if (!removed) {
      res.status(404).json({ error: 'not found' })
      return
    }
    res.status(204).end()
  })

  return router
}
```

(Express 5 forwards rejected handler promises to the error middleware — no per-handler try/catch needed; the 500 test proves it.)

- [ ] **Step 4: Run to verify all unit tests pass**

Run (from `app/`): `pnpm vitest run --project unit`
Expected: all pass (11 auth + 3 app + ~24 routes).

- [ ] **Step 5: Lint, typecheck, commit**

```bash
pnpm lint && pnpm typecheck
git add app/server/sightings/routes.ts app/server/sightings/routes.test.ts
git commit -m "feat: add sightings router with validation and auth-gated writes"
```

---

### Task 4: Wire into createApp and the entrypoint

**Files:**
- Modify: `app/server/app.ts` (deps, router mount, writes-disabled gate, error middleware)
- Modify: `app/server/index.ts` (store construction, credential env parsing, warning)
- Test: `app/server/app.test.ts` (update existing calls; add wiring + writes-disabled tests)

**Interfaces:**
- Consumes: `sightingsRouter` (Task 3), `createSightingsStore`/`SightingsStore` (Task 2), `requireWriteAuth` (Task 1)
- Produces: `createApp(deps: AppDeps)` with

```ts
export interface AppDeps {
  checkDb: () => Promise<void>
  sightingsStore: SightingsStore
  writeCredentials: { user: string; password: string } | null
}
```

Task 5's integration test constructs the app exactly this way.

- [ ] **Step 1: Update tests first**

In `app/server/app.test.ts`, add imports and a deps helper, update the three existing `createApp` calls to use it, and append the new tests:

```ts
import { describe, expect, it, vi } from 'vitest'
import { createApp, type AppDeps } from './app.js'
import { withServer } from './testUtils.js'
import type { SightingsStore } from './sightings/store.js'

function fakeStore(): SightingsStore {
  return {
    list: vi.fn(async () => []),
    create: vi.fn(async () => { throw new Error('unused') }),
    remove: vi.fn(async () => true),
  }
}

function deps(overrides: Partial<AppDeps> = {}): AppDeps {
  return {
    checkDb: async () => {},
    sightingsStore: fakeStore(),
    writeCredentials: null,
    ...overrides,
  }
}
```

Existing tests become `createApp(deps())`, `createApp(deps({ checkDb: async () => { throw new Error('connection refused') } }))`, and `createApp(deps())` respectively. Append:

```ts
describe('sightings wiring', () => {
  it('serves GET /api/sightings through the app', async () => {
    await withServer(createApp(deps()), async (base) => {
      const res = await fetch(`${base}/api/sightings`)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual([])
    })
  })

  it('returns 503 writes-disabled when credentials are absent', async () => {
    await withServer(createApp(deps()), async (base) => {
      const res = await fetch(`${base}/api/sightings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ emoji: '🦊', sightedOn: '2026-07-03' }),
      })
      expect(res.status).toBe(503)
      expect(await res.json()).toEqual({ error: 'writes disabled' })
    })
  })

  it('accepts authenticated writes when credentials are configured', async () => {
    const store = fakeStore()
    store.create = vi.fn(async (fields) => ({
      ...fields, id: '3f9a26cc-1c0e-4c3a-9b52-08a1c2f4d9aa', photoPath: null, createdAt: new Date(),
    }))
    const app = createApp(deps({ sightingsStore: store, writeCredentials: { user: 'natalie', password: 'sekrit' } }))
    await withServer(app, async (base) => {
      const res = await fetch(`${base}/api/sightings`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Basic ' + Buffer.from('natalie:sekrit').toString('base64'),
        },
        body: JSON.stringify({ emoji: '🦊', sightedOn: '2026-07-03' }),
      })
      expect(res.status).toBe(201)
    })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run (from `app/`): `pnpm vitest run --project unit`
Expected: FAIL — `app.ts` compile/type errors (`AppDeps` lacks the new fields) and the new tests fail.

- [ ] **Step 3: Update `app/server/app.ts`**

Full replacement:

```ts
import path from 'node:path'
import express, { type ErrorRequestHandler, type Express, type RequestHandler } from 'express'
import { requireWriteAuth } from './auth.js'
import { sightingsRouter } from './sightings/routes.js'
import type { SightingsStore } from './sightings/store.js'

export interface AppDeps {
  /** Resolves if the database is reachable, throws otherwise. */
  checkDb: () => Promise<void>
  sightingsStore: SightingsStore
  /** null → write endpoints respond 503 "writes disabled" (deny by default). */
  writeCredentials: { user: string; password: string } | null
}

const writesDisabled: RequestHandler = (_req, res) => {
  res.status(503).json({ error: 'writes disabled' })
}

export function createApp(deps: AppDeps): Express {
  const app = express()
  app.use(express.json())

  app.get('/api/health', async (_req, res) => {
    try {
      await deps.checkDb()
      res.json({ ok: true, db: true })
    } catch (err) {
      console.error('health check failed:', err)
      res.status(503).json({ ok: false, db: false })
    }
  })

  const writeGate = deps.writeCredentials
    ? requireWriteAuth(deps.writeCredentials.user, deps.writeCredentials.password)
    : writesDisabled
  app.use('/api/sightings', sightingsRouter(deps.sightingsStore, writeGate))

  const clientDir = path.resolve(import.meta.dirname, '../client')
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
      res.status(404).json({ error: 'not found' })
      return
    }
    if (process.env.NODE_ENV === 'production') {
      next() // fall through to static / SPA fallback below
      return
    }
    res.status(404).send('client is served by vite in development')
  })
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(clientDir))
    app.use((_req, res) => {
      res.sendFile('index.html', { root: clientDir })
    })
  }

  // Sanitized catch-all: store/db failures log server-side, clients get no details.
  app.use(((err, _req, res, _next) => {
    console.error('unhandled error:', err)
    if (res.headersSent) return
    res.status(500).json({ error: 'internal' })
  }) as ErrorRequestHandler)

  return app
}
```

- [ ] **Step 4: Update `app/server/index.ts`**

Full replacement:

```ts
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { createApp } from './app.js'
import { createDb } from './db/index.js'
import { createSightingsStore } from './sightings/store.js'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}

const { pool, db } = createDb(connectionString)

// cwd-relative: run from app/ in dev, /app in the container
await migrate(db, { migrationsFolder: 'drizzle' })
console.log('migrations up to date')

const writeUser = process.env.WRITE_USER ?? ''
const writePassword = process.env.WRITE_PASSWORD ?? ''
const writeCredentials =
  writeUser !== '' && writePassword !== '' ? { user: writeUser, password: writePassword } : null
if (!writeCredentials) {
  console.warn('WRITE_USER/WRITE_PASSWORD not set — write endpoints disabled (503)')
}

const app = createApp({
  checkDb: async () => {
    await pool.query('SELECT 1')
  },
  sightingsStore: createSightingsStore(db),
  writeCredentials,
})

const port = Number(process.env.PORT ?? 8080)
const server = app.listen(port, () => {
  console.log(`critter-tracker listening on :${port}`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => {
      void pool.end()
    })
  })
}
```

- [ ] **Step 5: Run all unit + client tests**

Run (from `app/`): `pnpm vitest run --project unit --project client`
Expected: all pass (client health-page tests unaffected).

- [ ] **Step 6: Lint, typecheck, commit**

```bash
pnpm lint && pnpm typecheck
git add app/server/app.ts app/server/app.test.ts app/server/index.ts
git commit -m "feat: mount sightings API in app with deny-by-default write gate"
```

---

### Task 5: Full-stack seam test, docs touch-up, end-to-end smoke

**Files:**
- Create: `app/server/sightings/api.integration.test.ts`
- Modify: `.env.example` (WRITE_USER/WRITE_PASSWORD comment — endpoints now exist)
- Modify: `README.md` (add API section)

**Interfaces:**
- Consumes: everything above, exactly as produced.
- Produces: nothing new — proof the seams hold.

- [ ] **Step 1: Write the seam test**

`app/server/sightings/api.integration.test.ts`:

```ts
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { createDb } from '../db/index.js'
import { withServer } from '../testUtils.js'
import { createSightingsStore } from './store.js'

const AUTH = 'Basic ' + Buffer.from('natalie:sekrit').toString('base64')

describe('sightings API against real postgres', () => {
  let container: StartedPostgreSqlContainer
  let handle: ReturnType<typeof createDb>

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18.4').start()
    handle = createDb(container.getConnectionUri())
    await migrate(handle.db, { migrationsFolder: 'drizzle' })
  })

  afterAll(async () => {
    await handle?.pool.end()
    await container?.stop()
  })

  function app() {
    return createApp({
      checkDb: async () => {
        await handle.pool.query('SELECT 1')
      },
      sightingsStore: createSightingsStore(handle.db),
      writeCredentials: { user: 'natalie', password: 'sekrit' },
    })
  }

  it('POST → GET → DELETE → GET round-trips through HTTP and the database', async () => {
    await withServer(app(), async (base) => {
      const unauthorized = await fetch(`${base}/api/sightings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ emoji: '🦉', sightedOn: '2026-07-03' }),
      })
      expect(unauthorized.status).toBe(401)

      const created = await fetch(`${base}/api/sightings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: AUTH },
        body: JSON.stringify({ emoji: '🦉', sightedOn: '2026-07-03', name: 'Owl', place: 'oak tree' }),
      })
      expect(created.status).toBe(201)
      const sighting = await created.json()
      expect(sighting.emoji).toBe('🦉')

      const listed = await (await fetch(`${base}/api/sightings`)).json()
      expect(listed).toHaveLength(1)
      expect(listed[0].id).toBe(sighting.id)
      expect(listed[0].place).toBe('oak tree')

      const deleted = await fetch(`${base}/api/sightings/${sighting.id}`, {
        method: 'DELETE',
        headers: { authorization: AUTH },
      })
      expect(deleted.status).toBe(204)

      expect(await (await fetch(`${base}/api/sightings`)).json()).toEqual([])
    })
  })
})
```

- [ ] **Step 2: Run the full suite**

Run (from `app/`): `pnpm test`
Expected: all projects green (unit, client, integration — 3 integration files now).

- [ ] **Step 3: Update `.env.example`**

Replace the WRITE_USER comment block:

```bash
# Credentials Natalie uses for write actions (logging/deleting sightings).
# Reads are public. Leave blank until write endpoints exist.
WRITE_USER=
WRITE_PASSWORD=
```

with:

```bash
# Credentials for write actions (POST/DELETE /api/sightings). Reads are public.
# If either is blank, write endpoints return 503 "writes disabled".
WRITE_USER=
WRITE_PASSWORD=
```

- [ ] **Step 4: Add an API section to `README.md`**

Insert after the "Running it" section (before "## Development"):

```markdown
## API

    GET    /api/sightings?from=YYYY-MM-DD&to=YYYY-MM-DD   # public; filters optional/inclusive
    POST   /api/sightings                                 # basic auth (WRITE_USER/WRITE_PASSWORD)
    DELETE /api/sightings/:id                             # basic auth

POST body: `emoji` and `sightedOn` (YYYY-MM-DD) required; `name`, `sightedTime`,
`place`, `comment` optional. With blank write credentials the write endpoints
return 503.
```

- [ ] **Step 5: Compose smoke test (spec Definition of Done)**

From the repo root (Docker running; `.env` already exists from the skeleton — add test write credentials for the smoke):

```bash
grep -q '^WRITE_USER=.' .env || sed -i '' 's/^WRITE_USER=$/WRITE_USER=natalie/' .env
grep -q '^WRITE_PASSWORD=.' .env || sed -i '' "s/^WRITE_PASSWORD=$/WRITE_PASSWORD=$(openssl rand -hex 12)/" .env
docker compose up -d --build
sleep 2
PASS=$(grep '^WRITE_PASSWORD=' .env | cut -d= -f2)
curl -s -X POST -u "natalie:$PASS" -H 'content-type: application/json' \
  -d '{"emoji":"🦔","sightedOn":"2026-07-03","name":"Smoke Hedgehog"}' \
  http://localhost:8080/api/sightings
curl -s http://localhost:8080/api/sightings
curl -s -X POST http://localhost:8080/api/sightings -H 'content-type: application/json' -d '{"emoji":"🦊","sightedOn":"2026-07-03"}'
```

Expected: first curl returns the created sighting (201 body with id); second returns an array containing Smoke Hedgehog; third returns `{"error":"unauthorized"}` (401, no credentials).

Then delete the smoke row and stop the stack:

```bash
ID=$(curl -s http://localhost:8080/api/sightings | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['id'])")
curl -s -X DELETE -u "natalie:$PASS" -o /dev/null -w '%{http_code}\n' http://localhost:8080/api/sightings/$ID
docker compose down
```

Expected: `204`, then stack down (volumes intact).

- [ ] **Step 6: Commit**

```bash
git add app/server/sightings/api.integration.test.ts .env.example README.md
git commit -m "feat: full-stack sightings API seam test, docs, env guidance"
```

---

## Final verification (spec Definition of Done)

- [ ] All three endpoints behave per contract against the compose stack (Task 5 Step 5).
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test:coverage`, `pnpm build` all pass in `app/`.
- [ ] Empty-credential guard + missing-colon test in place (Task 1); writes 503 when creds absent (Task 4).
- [ ] No UI changes (git diff touches nothing under `app/src/`).
- [ ] CI green after push.
