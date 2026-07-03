# App Shell + Log a Sighting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The responsive app shell (header, tabs, sheet) and the two-step log-a-sighting flow with prompt-on-first-save auth, per `docs/superpowers/specs/2026-07-03-shell-log-sighting-design.md`.

**Architecture:** Client-only cycle (plus an opening server test-hygiene commit). A typed `api.ts` + `auth.ts` pair, one `useSightings` hook holding the sightings array, and presentational components composed in `App.tsx`. Mobile-first CSS with a single `min-width: 880px` media query for the two-column dashboard. All visual values come from `docs/design/README.md` via CSS custom properties.

**Tech Stack:** React 19, TypeScript 6, Vitest 4 + Testing Library (jsdom), CSS custom properties (no CSS framework), localStorage for write credentials.

**Spec:** `docs/superpowers/specs/2026-07-03-shell-log-sighting-design.md`
**Design source:** `docs/design/README.md` (§1 shell, §5 log flow, §Sheet, §Desktop Layout, Design Tokens table)

## Global Constraints

- pnpm 11.9.0 only; pnpm commands run from `app/`. Server-side relative imports use `.js` extensions.
- Client tests: `pnpm vitest run --project client` (jsdom, globals on, setupFiles `./src/test/setup.ts`). Integration: `--project integration`. Unit: `--project unit`.
- Components use CSS custom properties from `index.css`, never raw hexes in TSX.
- Wire contract (fixed by the merged API): `Sighting = { id, emoji, name, sightedOn, sightedTime, place, comment, photoPath, createdAt }` — nullable fields are `null`, `createdAt` is an ISO string, `sightedOn` is `YYYY-MM-DD`. POST accepts only `emoji` (required), `sightedOn` (required), `name`, `sightedTime`, `place`, `comment`; 201 returns the row; 401 unauthorized; 503 `{"error":"writes disabled"}`.
- Write credentials: localStorage key `critter-write-auth`, user always `natalie`.
- Copy is exact: title "🐾 Natalie Saw a Critter!", tabs "Calendar" / "History" / "Top Critters", button "+ Log a sighting", picker heading "What did Natalie see?", toast "🎉 Logged!", meta format "Mon D · time" with "just now" when no time.
- No FAB. No photo control. Recent Critters rows are inert this cycle.
- Working directory: the repo (or its worktree copy); paths are repo-relative.

---

### Task 1: Server test hygiene (single shared Postgres container, shared helpers)

**Files:**
- Create: `app/server/testGlobalSetup.ts`, `app/server/testDb.ts`, `app/server/errorHandler.ts`
- Modify: `app/vitest.config.ts` (integration project gains globalSetup), `app/server/app.ts` (use extracted errorHandler), `app/server/testUtils.ts` (add `basic`), `app/server/db/db.integration.test.ts`, `app/server/sightings/store.integration.test.ts`, `app/server/sightings/api.integration.test.ts` (use shared container), `app/server/auth.test.ts`, `app/server/app.test.ts`, `app/server/sightings/routes.test.ts` (use shared `basic` / real errorHandler)

**Interfaces:**
- Consumes: existing integration tests and `createDb`.
- Produces: `createTestDb(): Promise<ReturnType<typeof createDb>>` from `server/testDb.js` (fresh database on the one shared container, migrations applied); `basic(user: string, pass: string): string` from `server/testUtils.js`; `errorHandler: ErrorRequestHandler` from `server/errorHandler.js` (the real app middleware, importable by tests).

- [ ] **Step 1: Create the global setup and per-file DB helper**

`app/server/testGlobalSetup.ts`:

```ts
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import type { TestProject } from 'vitest/node'

declare module 'vitest' {
  export interface ProvidedContext {
    pgAdminUri: string
  }
}

export default async function setup(project: TestProject) {
  const container = await new PostgreSqlContainer('postgres:18.4').start()
  project.provide('pgAdminUri', container.getConnectionUri())
  return async () => {
    await container.stop()
  }
}
```

`app/server/testDb.ts`:

```ts
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { inject } from 'vitest'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { createDb } from './db/index.js'

/**
 * Fresh database on the suite's single shared Postgres container.
 * One call per test file — files run in parallel workers, so each
 * gets its own isolated database instead of its own container.
 */
export async function createTestDb() {
  const adminUri = inject('pgAdminUri')
  const dbName = 'test_' + randomUUID().replaceAll('-', '')
  const admin = new pg.Client({ connectionString: adminUri })
  await admin.connect()
  await admin.query(`CREATE DATABASE ${dbName}`)
  await admin.end()
  const url = new URL(adminUri)
  url.pathname = `/${dbName}`
  const handle = createDb(url.toString())
  await migrate(handle.db, { migrationsFolder: 'drizzle' })
  return handle
}
```

- [ ] **Step 2: Register globalSetup for the integration project**

In `app/vitest.config.ts`, add `'server/testDb.ts'` and `'server/testGlobalSetup.ts'` to the root coverage `exclude` array (test infrastructure, not product code), and the integration project entry becomes:

```ts
      {
        test: {
          name: 'integration',
          environment: 'node',
          include: ['server/**/*.integration.test.ts'],
          globalSetup: ['./server/testGlobalSetup.ts'],
          testTimeout: 120_000,
          hookTimeout: 120_000,
        },
      },
```

- [ ] **Step 3: Convert the three integration files**

In each of `app/server/db/db.integration.test.ts`, `app/server/sightings/store.integration.test.ts`, `app/server/sightings/api.integration.test.ts`:
- Remove the `PostgreSqlContainer` import, `container` variable, `container.start()`, `migrate(...)` call, and `container.stop()`.
- Replace the `beforeAll` body with `handle = await createTestDb()` (import from `../testDb.js` or `../../testDb.js` as depth requires).
- Keep `afterAll(async () => { await handle?.pool.end() })`.
- Keep each file's own row cleanup (`beforeEach` deletes) — it still guards intra-file ordering.

Example (store.integration.test.ts beforeAll after conversion):

```ts
import { createTestDb } from '../testDb.js'
// ...
  beforeAll(async () => {
    handle = await createTestDb()
    store = createSightingsStore(handle.db)
  })

  afterAll(async () => {
    await handle?.pool.end()
  })
```

- [ ] **Step 4: Extract the real error handler and share `basic()`**

`app/server/errorHandler.ts` (moved verbatim from `app.ts`'s inline middleware):

```ts
import type { ErrorRequestHandler } from 'express'

// Sanitized catch-all: 4xx from body parsing keep their status; everything
// else logs server-side and returns a detail-free 500.
export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    next(err)
    return
  }
  const status =
    typeof err === 'object' && err !== null && 'status' in err &&
    typeof err.status === 'number' && err.status >= 400 && err.status < 500
      ? err.status
      : 500
  if (status === 500) console.error('unhandled error:', err)
  res.status(status).json(status === 500 ? { error: 'internal' } : { error: 'bad request' })
}
```

In `app/server/app.ts`: `import { errorHandler } from './errorHandler.js'`, replace the inline `app.use(((err, ...` block with `app.use(errorHandler)`, and drop the now-unused `ErrorRequestHandler` type import.

Append to `app/server/testUtils.ts`:

```ts
export function basic(user: string, pass: string): string {
  return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64')
}
```

Then:
- `app/server/auth.test.ts`: delete its local `basic` definition, import from `./testUtils.js`.
- `app/server/app.test.ts` and `app/server/sightings/api.integration.test.ts`: replace inline `'Basic ' + Buffer.from(...)` constructions with `basic('natalie', 'sekrit')`.
- `app/server/sightings/routes.test.ts`: replace its hand-rolled 500 middleware with `import { errorHandler } from '../errorHandler.js'` and `app.use(errorHandler)`; replace its inline auth header with `basic(...)`.

- [ ] **Step 5: Run everything**

Run (from `app/`): `pnpm lint && pnpm typecheck && pnpm test`
Expected: all green; the integration project now boots ONE container (visible in runtime — expect a noticeably faster integration phase).

- [ ] **Step 6: Commit**

```bash
git add app/server app/vitest.config.ts
git commit -m "test: share one postgres container across integration files, extract errorHandler and basic()"
```

---

### Task 2: Design tokens + critter/format libraries

**Files:**
- Modify: `app/src/index.css` (full token set; keep existing rules)
- Create: `app/src/lib/critters.ts`, `app/src/lib/format.ts`
- Test: `app/src/lib/critters.test.ts`, `app/src/lib/format.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `CURATED: Critter[]` (12, each `{ emoji: string; name: string; tint: string }` — tint is a CSS var reference), `EXTENDED: string[]` (16 emoji) from `lib/critters`; `formatWhen(sightedOn: string, sightedTime: string | null): string` from `lib/format` ("Jul 3 · dusk" / "Jul 3 · just now").

- [ ] **Step 1: Write the failing lib tests**

`app/src/lib/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatWhen } from './format'

describe('formatWhen', () => {
  it('formats date and free-text time', () => {
    expect(formatWhen('2026-07-03', 'dusk')).toBe('Jul 3 · dusk')
  })

  it('uses "just now" when time is null', () => {
    expect(formatWhen('2026-12-25', null)).toBe('Dec 25 · just now')
  })

  it('is not shifted by timezone (parses as local date)', () => {
    expect(formatWhen('2026-01-01', null)).toBe('Jan 1 · just now')
  })
})
```

`app/src/lib/critters.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { CURATED, EXTENDED } from './critters'

describe('critter sets', () => {
  it('has the 12 curated critters in design order', () => {
    expect(CURATED.map((c) => c.name)).toEqual([
      'Deer', 'Squirrel', 'Bird', 'Rabbit', 'Butterfly', 'Turtle',
      'Owl', 'Fox', 'Raccoon', 'Hedgehog', 'Frog', 'Duck',
    ])
    for (const c of CURATED) {
      expect(c.emoji.length).toBeGreaterThan(0)
      expect(c.tint).toMatch(/^var\(--tint-/)
    }
  })

  it('has 16 extended emoji with no duplicates', () => {
    expect(EXTENDED).toHaveLength(16)
    expect(new Set(EXTENDED).size).toBe(16)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run (from `app/`): `pnpm vitest run --project client`
Expected: FAIL — cannot resolve `./format` / `./critters`.

- [ ] **Step 3: Implement the libraries**

`app/src/lib/format.ts`:

```ts
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Jul 3 · dusk" — sightedOn is YYYY-MM-DD; parsed by split (never Date parsing, which is UTC-shifted). */
export function formatWhen(sightedOn: string, sightedTime: string | null): string {
  const [, month, day] = sightedOn.split('-').map(Number)
  return `${MONTHS[month - 1]} ${day} · ${sightedTime ?? 'just now'}`
}
```

`app/src/lib/critters.ts`:

```ts
export type Critter = { emoji: string; name: string; tint: string }

// docs/design/README.md — "Critter tile tints" token row
export const CURATED: Critter[] = [
  { emoji: '🦌', name: 'Deer', tint: 'var(--tint-pink)' },
  { emoji: '🐿️', name: 'Squirrel', tint: 'var(--tint-peach)' },
  { emoji: '🐦', name: 'Bird', tint: 'var(--tint-yellow)' },
  { emoji: '🐇', name: 'Rabbit', tint: 'var(--tint-mint)' },
  { emoji: '🦋', name: 'Butterfly', tint: 'var(--tint-aqua)' },
  { emoji: '🐢', name: 'Turtle', tint: 'var(--tint-sky)' },
  { emoji: '🦉', name: 'Owl', tint: 'var(--tint-lavender)' },
  { emoji: '🦊', name: 'Fox', tint: 'var(--tint-orchid)' },
  { emoji: '🦝', name: 'Raccoon', tint: 'var(--tint-pink)' },
  { emoji: '🦔', name: 'Hedgehog', tint: 'var(--tint-peach)' },
  { emoji: '🐸', name: 'Frog', tint: 'var(--tint-mint)' },
  { emoji: '🦆', name: 'Duck', tint: 'var(--tint-sky)' },
]

// docs/design/README.md — §5 "Other" secondary grid, in listed order
export const EXTENDED: string[] = [
  '🐝', '🐌', '🦎', '🐍', '🦇', '🐭', '🦅', '🐺',
  '🦫', '🐊', '🦭', '🦩', '🐙', '🦂', '🐞', '🕷️',
]
```

- [ ] **Step 4: Extend `app/src/index.css` tokens**

Replace the `:root` block with (existing body/shell/header/status rules stay for now — Task 7 reworks layout):

```css
:root {
  /* Rainbow Sherbet tokens — docs/design/README.md "Design Tokens" */
  --ink: #4a3b63;
  --ink-secondary: #9aa8c7;
  --ink-tertiary: #afc0de;
  --border-hairline: #e3ecfa;
  --surface-input: #f0f7ff;
  --tab-calendar: #8fb8ff;
  --tab-history: #5fbfa6;
  --tab-leaderboard: #b79bf2;
  --danger-text: #d2555c;
  --danger-bg: #ffe3e3;
  --toast-bg: #4a5f8e;
  --other-border: #9db6e8;
  --other-text: #5f80c7;
  --scrim: rgba(70, 90, 140, 0.28);
  --shadow-shell: 0 20px 50px rgba(70, 90, 140, 0.22);
  --shadow-card: 0 4px 14px rgba(90, 100, 150, 0.08);
  --tint-pink: #ffd1dc;
  --tint-peach: #ffe1b8;
  --tint-yellow: #fff6b8;
  --tint-mint: #d7f5c8;
  --tint-aqua: #c8f0e4;
  --tint-sky: #c7e3fa;
  --tint-lavender: #d9cff2;
  --tint-orchid: #f3cdee;
  --rainbow: linear-gradient(
    90deg,
    #ffd1dc, #ffe1b8, #fff6b8, #d7f5c8, #c8f0e4, #c7e3fa, #d9cff2
  );
  --save-gradient: linear-gradient(135deg, #8fd8c4, #8fb8ff);
}
```

- [ ] **Step 5: Run to verify pass, lint, typecheck, commit**

```bash
pnpm vitest run --project client && pnpm lint && pnpm typecheck
git add app/src/lib app/src/index.css
git commit -m "feat: design tokens and critter/format libraries"
```

---

### Task 3: api.ts + auth.ts (typed client + credential storage)

**Files:**
- Create: `app/src/api.ts`, `app/src/auth.ts`
- Test: `app/src/api.test.ts`, `app/src/auth.test.ts`

**Interfaces:**
- Consumes: wire contract (Global Constraints).
- Produces:

```ts
// api.ts
export type Sighting = {
  id: string; emoji: string; name: string | null; sightedOn: string
  sightedTime: string | null; place: string | null; comment: string | null
  photoPath: string | null; createdAt: string
}
export type NewSightingInput = {
  emoji: string; sightedOn: string
  name?: string; sightedTime?: string; place?: string; comment?: string
}
export class ApiError extends Error { status: number }
export async function listSightings(): Promise<Sighting[]>
export async function createSighting(fields: NewSightingInput, authHeader: string): Promise<Sighting>
// auth.ts
export type Credentials = { user: string; password: string }
export function getCredentials(): Credentials | null
export function setCredentials(password: string): void   // user is always 'natalie'
export function clearCredentials(): void
export function basicHeader(creds: Credentials): string
```

- [ ] **Step 1: Write the failing tests**

`app/src/auth.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest'
import { basicHeader, clearCredentials, getCredentials, setCredentials } from './auth'

afterEach(() => {
  localStorage.clear()
})

describe('credential storage', () => {
  it('returns null when nothing is stored', () => {
    expect(getCredentials()).toBeNull()
  })

  it('stores and retrieves credentials with user natalie', () => {
    setCredentials('sekrit')
    expect(getCredentials()).toEqual({ user: 'natalie', password: 'sekrit' })
  })

  it('clears credentials', () => {
    setCredentials('sekrit')
    clearCredentials()
    expect(getCredentials()).toBeNull()
  })

  it('survives corrupt stored JSON by returning null', () => {
    localStorage.setItem('critter-write-auth', '{nope')
    expect(getCredentials()).toBeNull()
  })

  it('builds the Basic header', () => {
    expect(basicHeader({ user: 'natalie', password: 'sekrit' })).toBe(
      'Basic ' + btoa('natalie:sekrit'),
    )
  })
})
```

`app/src/api.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, createSighting, listSightings } from './api'

function stubFetch(status: number, body: unknown) {
  const mock = vi.fn(async () => new Response(JSON.stringify(body), { status }))
  vi.stubGlobal('fetch', mock)
  return mock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

const ROW = {
  id: '3f9a26cc-1c0e-4c3a-9b52-08a1c2f4d9aa', emoji: '🦊', name: 'Fox',
  sightedOn: '2026-07-03', sightedTime: null, place: null, comment: null,
  photoPath: null, createdAt: '2026-07-03T12:00:00.000Z',
}

describe('listSightings', () => {
  it('GETs /api/sightings and returns the array', async () => {
    const mock = stubFetch(200, [ROW])
    await expect(listSightings()).resolves.toEqual([ROW])
    expect(mock).toHaveBeenCalledWith('/api/sightings')
  })

  it('throws ApiError with status on failure', async () => {
    stubFetch(500, { error: 'internal' })
    await expect(listSightings()).rejects.toMatchObject({ status: 500 })
    stubFetch(500, { error: 'internal' })
    await expect(listSightings()).rejects.toBeInstanceOf(ApiError)
  })
})

describe('createSighting', () => {
  it('POSTs JSON with the auth header and returns the created row', async () => {
    const mock = stubFetch(201, ROW)
    const result = await createSighting({ emoji: '🦊', sightedOn: '2026-07-03', name: 'Fox' }, 'Basic abc')
    expect(result).toEqual(ROW)
    expect(mock).toHaveBeenCalledWith('/api/sightings', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Basic abc' },
      body: JSON.stringify({ emoji: '🦊', sightedOn: '2026-07-03', name: 'Fox' }),
    })
  })

  it('throws ApiError 401 on bad credentials', async () => {
    stubFetch(401, { error: 'unauthorized' })
    await expect(
      createSighting({ emoji: '🦊', sightedOn: '2026-07-03' }, 'Basic bad'),
    ).rejects.toMatchObject({ status: 401 })
  })

  it('throws ApiError 503 when writes are disabled', async () => {
    stubFetch(503, { error: 'writes disabled' })
    await expect(
      createSighting({ emoji: '🦊', sightedOn: '2026-07-03' }, 'Basic abc'),
    ).rejects.toMatchObject({ status: 503 })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run (from `app/`): `pnpm vitest run --project client`
Expected: FAIL — cannot resolve `./auth` / `./api`.

- [ ] **Step 3: Implement**

`app/src/auth.ts`:

```ts
const STORAGE_KEY = 'critter-write-auth'
const USER = 'natalie'

export type Credentials = { user: string; password: string }

export function getCredentials(): Credentials | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw === null) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === 'object' && parsed !== null &&
      'user' in parsed && typeof parsed.user === 'string' &&
      'password' in parsed && typeof parsed.password === 'string'
    ) {
      return { user: parsed.user, password: parsed.password }
    }
  } catch {
    // corrupt storage — treat as absent
  }
  return null
}

export function setCredentials(password: string): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ user: USER, password }))
}

export function clearCredentials(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export function basicHeader(creds: Credentials): string {
  return 'Basic ' + btoa(`${creds.user}:${creds.password}`)
}
```

`app/src/api.ts`:

```ts
export type Sighting = {
  id: string
  emoji: string
  name: string | null
  sightedOn: string
  sightedTime: string | null
  place: string | null
  comment: string | null
  photoPath: string | null
  createdAt: string
}

export type NewSightingInput = {
  emoji: string
  sightedOn: string
  name?: string
  sightedTime?: string
  place?: string
  comment?: string
}

export class ApiError extends Error {
  status: number

  constructor(status: number) {
    super(`API error ${status}`)
    this.status = status
  }
}

export async function listSightings(): Promise<Sighting[]> {
  const res = await fetch('/api/sightings')
  if (!res.ok) throw new ApiError(res.status)
  return (await res.json()) as Sighting[]
}

export async function createSighting(
  fields: NewSightingInput,
  authHeader: string,
): Promise<Sighting> {
  const res = await fetch('/api/sightings', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: authHeader },
    body: JSON.stringify(fields),
  })
  if (!res.ok) throw new ApiError(res.status)
  return (await res.json()) as Sighting
}
```

- [ ] **Step 4: Run to verify pass, lint, typecheck, commit**

```bash
pnpm vitest run --project client && pnpm lint && pnpm typecheck
git add app/src/api.ts app/src/api.test.ts app/src/auth.ts app/src/auth.test.ts
git commit -m "feat: typed api client and write-credential storage"
```

---

### Task 4: useSightings hook

**Files:**
- Create: `app/src/hooks/useSightings.ts`
- Test: `app/src/hooks/useSightings.test.ts`

**Interfaces:**
- Consumes: `listSightings`, `createSighting`, types from `../api` (Task 3).
- Produces:

```ts
export type SightingsState = {
  sightings: Sighting[]
  status: 'loading' | 'ready' | 'error'
  addSighting(fields: NewSightingInput, authHeader: string): Promise<void>  // rethrows ApiError
  retry(): void
}
export function useSightings(): SightingsState
```

- [ ] **Step 1: Write the failing tests**

`app/src/hooks/useSightings.test.ts`:

```ts
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Sighting } from '../api'
import { useSightings } from './useSightings'

const ROW: Sighting = {
  id: '3f9a26cc-1c0e-4c3a-9b52-08a1c2f4d9aa', emoji: '🦊', name: 'Fox',
  sightedOn: '2026-07-03', sightedTime: null, place: null, comment: null,
  photoPath: null, createdAt: '2026-07-03T12:00:00.000Z',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetchOnce(responses: Array<{ status: number; body: unknown }>) {
  const queue = [...responses]
  vi.stubGlobal('fetch', vi.fn(async () => {
    const next = queue.shift() ?? { status: 500, body: { error: 'internal' } }
    return new Response(JSON.stringify(next.body), { status: next.status })
  }))
}

describe('useSightings', () => {
  it('loads sightings on mount', async () => {
    stubFetchOnce([{ status: 200, body: [ROW] }])
    const { result } = renderHook(() => useSightings())
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.sightings).toEqual([ROW])
  })

  it('reports error state on load failure and recovers via retry', async () => {
    stubFetchOnce([
      { status: 500, body: { error: 'internal' } },
      { status: 200, body: [ROW] },
    ])
    const { result } = renderHook(() => useSightings())
    await waitFor(() => expect(result.current.status).toBe('error'))
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.sightings).toEqual([ROW])
  })

  it('addSighting prepends the created row', async () => {
    const newRow = { ...ROW, id: '00000000-0000-4000-8000-000000000001', emoji: '🦉' }
    stubFetchOnce([
      { status: 200, body: [ROW] },
      { status: 201, body: newRow },
    ])
    const { result } = renderHook(() => useSightings())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await act(() => result.current.addSighting({ emoji: '🦉', sightedOn: '2026-07-03' }, 'Basic x'))
    expect(result.current.sightings.map((s) => s.emoji)).toEqual(['🦉', '🦊'])
  })

  it('addSighting rethrows ApiError without mutating state', async () => {
    stubFetchOnce([
      { status: 200, body: [ROW] },
      { status: 401, body: { error: 'unauthorized' } },
    ])
    const { result } = renderHook(() => useSightings())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await expect(
      act(() => result.current.addSighting({ emoji: '🦉', sightedOn: '2026-07-03' }, 'Basic bad')),
    ).rejects.toMatchObject({ status: 401 })
    expect(result.current.sightings).toEqual([ROW])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run --project client`
Expected: FAIL — cannot resolve `./useSightings`.

- [ ] **Step 3: Implement**

`app/src/hooks/useSightings.ts`:

```ts
import { useCallback, useEffect, useState } from 'react'
import { createSighting, listSightings, type NewSightingInput, type Sighting } from '../api'

export type SightingsState = {
  sightings: Sighting[]
  status: 'loading' | 'ready' | 'error'
  addSighting(fields: NewSightingInput, authHeader: string): Promise<void>
  retry(): void
}

export function useSightings(): SightingsState {
  const [sightings, setSightings] = useState<Sighting[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadCount, setLoadCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    listSightings()
      .then((rows) => {
        if (cancelled) return
        setSightings(rows)
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [loadCount])

  const retry = useCallback(() => setLoadCount((n) => n + 1), [])

  const addSighting = useCallback(async (fields: NewSightingInput, authHeader: string) => {
    const created = await createSighting(fields, authHeader)
    setSightings((current) => [created, ...current])
  }, [])

  return { sightings, status, addSighting, retry }
}
```

- [ ] **Step 4: Run to verify pass, lint, typecheck, commit**

```bash
pnpm vitest run --project client && pnpm lint && pnpm typecheck
git add app/src/hooks
git commit -m "feat: useSightings hook with load/retry/add"
```

---

### Task 5: Sheet, Toast, PasswordPrompt (reusable chrome)

**Files:**
- Create: `app/src/components/Sheet.tsx`, `app/src/components/Toast.tsx`, `app/src/components/PasswordPrompt.tsx`
- Modify: `app/src/index.css` (append component styles)
- Test: `app/src/components/Sheet.test.tsx`, `app/src/components/Toast.test.tsx`, `app/src/components/PasswordPrompt.test.tsx`

**Interfaces:**
- Consumes: tokens from Task 2.
- Produces:

```ts
Sheet:          { open: boolean; onClose(): void; children: ReactNode }   // scrim + Escape close
Toast:          { message: string | null }                                 // renders nothing when null; auto-hide is the OWNER's job
PasswordPrompt: { open: boolean; error: string | null; onSubmit(password: string): void; onCancel(): void }
```

- [ ] **Step 1: Write the failing tests**

`app/src/components/Sheet.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Sheet } from './Sheet'

describe('Sheet', () => {
  it('renders nothing when closed', () => {
    render(<Sheet open={false} onClose={() => {}}>hi</Sheet>)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders children in a dialog when open', () => {
    render(<Sheet open onClose={() => {}}><p>content</p></Sheet>)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('content')).toBeInTheDocument()
  })

  it('calls onClose on scrim click but not on content click', async () => {
    const onClose = vi.fn()
    render(<Sheet open onClose={onClose}><p>content</p></Sheet>)
    await userEvent.click(screen.getByText('content'))
    expect(onClose).not.toHaveBeenCalled()
    await userEvent.click(screen.getByTestId('sheet-scrim'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose on Escape', async () => {
    const onClose = vi.fn()
    render(<Sheet open onClose={onClose}>x</Sheet>)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
```

`app/src/components/Toast.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Toast } from './Toast'

describe('Toast', () => {
  it('renders nothing when message is null', () => {
    render(<Toast message={null} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('renders the message when set', () => {
    render(<Toast message="🎉 Logged!" />)
    expect(screen.getByRole('status')).toHaveTextContent('🎉 Logged!')
  })
})
```

`app/src/components/PasswordPrompt.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PasswordPrompt } from './PasswordPrompt'

describe('PasswordPrompt', () => {
  it('renders nothing when closed', () => {
    render(<PasswordPrompt open={false} error={null} onSubmit={() => {}} onCancel={() => {}} />)
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument()
  })

  it('submits the typed password', async () => {
    const onSubmit = vi.fn()
    render(<PasswordPrompt open error={null} onSubmit={onSubmit} onCancel={() => {}} />)
    await userEvent.type(screen.getByLabelText(/password/i), 'sekrit')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(onSubmit).toHaveBeenCalledWith('sekrit')
  })

  it('shows the error note when provided', () => {
    render(<PasswordPrompt open error="Wrong password — try again" onSubmit={() => {}} onCancel={() => {}} />)
    expect(screen.getByText('Wrong password — try again')).toBeInTheDocument()
  })

  it('cancel calls onCancel', async () => {
    const onCancel = vi.fn()
    render(<PasswordPrompt open error={null} onSubmit={() => {}} onCancel={onCancel} />)
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run --project client`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the components**

`app/src/components/Sheet.tsx`:

```tsx
import { useEffect, type ReactNode } from 'react'

type Props = { open: boolean; onClose: () => void; children: ReactNode }

/** Bottom sheet on mobile, centered modal ≥880px — docs/design/README.md §Sheet. */
export function Sheet({ open, onClose, children }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="sheet-scrim" data-testid="sheet-scrim" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        {children}
      </div>
    </div>
  )
}
```

`app/src/components/Toast.tsx`:

```tsx
type Props = { message: string | null }

export function Toast({ message }: Props) {
  if (message === null) return null
  return (
    <div className="toast" role="status">
      {message}
    </div>
  )
}
```

`app/src/components/PasswordPrompt.tsx`:

```tsx
import { useState } from 'react'

type Props = {
  open: boolean
  error: string | null
  onSubmit: (password: string) => void
  onCancel: () => void
}

export function PasswordPrompt({ open, error, onSubmit, onCancel }: Props) {
  const [password, setPassword] = useState('')
  if (!open) return null
  return (
    <div className="password-prompt">
      <h3>Natalie, what's the magic word?</h3>
      {error !== null && <p className="password-error">{error}</p>}
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
      </label>
      <div className="password-actions">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn-primary" onClick={() => onSubmit(password)}>
          Save
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Append component styles to `app/src/index.css`**

```css
/* Sheet / modal — mobile bottom sheet, desktop centered (design §Sheet) */
.sheet-scrim {
  position: fixed;
  inset: 0;
  background: var(--scrim);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 20;
}

.sheet {
  background: #fff;
  width: 100%;
  border-radius: 26px 26px 0 0;
  padding: 10px 18px 22px;
  max-height: 85vh;
  overflow-y: auto;
}

.sheet-handle {
  width: 36px;
  height: 5px;
  border-radius: 999px;
  background: var(--border-hairline);
  margin: 0 auto 10px;
}

@media (min-width: 880px) {
  .sheet-scrim {
    align-items: center;
  }
  .sheet {
    max-width: 460px;
    border-radius: 24px;
  }
}

.toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--toast-bg);
  color: #fff;
  padding: 10px 18px;
  border-radius: 999px;
  font-weight: 600;
  font-size: 13px;
  z-index: 30;
}

.password-prompt h3 {
  font-family: 'Fredoka', sans-serif;
  font-weight: 600;
  font-size: 17px;
  margin: 4px 0 10px;
}

.password-prompt label {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: var(--ink-secondary);
}

.password-prompt input {
  display: block;
  width: 100%;
  box-sizing: border-box;
  margin-top: 4px;
  padding: 10px;
  border: 1px solid var(--border-hairline);
  border-radius: 14px;
  background: var(--surface-input);
  font: inherit;
}

.password-error {
  color: var(--danger-text);
  font-size: 12px;
  font-weight: 700;
  margin: 0 0 8px;
}

.password-actions {
  display: flex;
  gap: 10px;
  margin-top: 14px;
}

.btn-primary,
.btn-secondary {
  flex: 1;
  padding: 12px;
  border-radius: 14px;
  border: none;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.btn-primary {
  background: var(--save-gradient);
  color: #fff;
}

.btn-secondary {
  background: var(--surface-input);
  color: var(--ink);
  border: 1px solid var(--border-hairline);
}
```

- [ ] **Step 5: Run to verify pass, lint, typecheck, commit**

```bash
pnpm vitest run --project client && pnpm lint && pnpm typecheck
git add app/src/components app/src/index.css
git commit -m "feat: reusable sheet, toast, and password prompt components"
```

---

### Task 6: EmojiPicker, DetailsForm, LogSightingFlow

**Files:**
- Create: `app/src/components/EmojiPicker.tsx`, `app/src/components/DetailsForm.tsx`, `app/src/components/LogSightingFlow.tsx`
- Modify: `app/src/index.css` (append flow styles)
- Test: `app/src/components/LogSightingFlow.test.tsx`

**Interfaces:**
- Consumes: `Sheet`, `PasswordPrompt` (Task 5); `CURATED`, `EXTENDED` (Task 2); `auth.ts` + `NewSightingInput`/`ApiError` (Task 3).
- Produces:

```ts
EmojiPicker:     { onPick(emoji: string, name: string | null): void; onCancel(): void }
DetailsForm:     { emoji: string; initialName: string | null; onBack(): void;
                   onSave(fields: NewSightingInput): void; saving: boolean }
LogSightingFlow: { open: boolean; onClose(): void;
                   onSave(fields: NewSightingInput, authHeader: string): Promise<void>;  // = useSightings.addSighting
                   onLogged(): void }
```

The flow owns: step state (`picker` → `details`), draft, credential lookup/prompting via `auth.ts`, and error mapping (401 → clear + re-prompt; 503 → "Saving is disabled right now"; other → "Couldn't save — try again"). Errors surface in an inline `.flow-error` message inside the sheet (not a toast) so the sheet/draft stay put; `onLogged` fires only on success.

- [ ] **Step 1: Write the failing tests**

`app/src/components/LogSightingFlow.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NewSightingInput } from '../api'
import { ApiError } from '../api'
import { setCredentials } from '../auth'
import { LogSightingFlow } from './LogSightingFlow'

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-07-03T15:00:00'))
})

afterEach(() => {
  vi.useRealTimers()
  localStorage.clear()
})

function renderFlow(overrides: Partial<Parameters<typeof LogSightingFlow>[0]> = {}) {
  const onSave = vi.fn(async (_f: NewSightingInput, _h: string) => {})
  const onLogged = vi.fn()
  const onClose = vi.fn()
  render(
    <LogSightingFlow open onClose={onClose} onSave={onSave} onLogged={onLogged} {...overrides} />,
  )
  return { onSave, onLogged, onClose }
}

describe('LogSightingFlow', () => {
  it('starts on the picker with the heading and 12 curated tiles + Other', () => {
    renderFlow()
    expect(screen.getByText('What did Natalie see?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /deer/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /duck/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /other/i })).toBeInTheDocument()
  })

  it('Other expands the extended grid inline', async () => {
    renderFlow()
    expect(screen.queryByRole('button', { name: '🐝' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /other/i }))
    expect(screen.getByRole('button', { name: '🐝' })).toBeInTheDocument()
    // still on the picker step
    expect(screen.getByText('What did Natalie see?')).toBeInTheDocument()
  })

  it('picking a curated critter advances to details with the name pre-filled and today as date', async () => {
    renderFlow()
    await userEvent.click(screen.getByRole('button', { name: /fox/i }))
    expect(screen.getByLabelText(/critter name/i)).toHaveValue('Fox')
    expect(screen.getByLabelText(/date/i)).toHaveValue('2026-07-03')
  })

  it('picking an extended emoji leaves the name blank', async () => {
    renderFlow()
    await userEvent.click(screen.getByRole('button', { name: /other/i }))
    await userEvent.click(screen.getByRole('button', { name: '🐝' }))
    expect(screen.getByLabelText(/critter name/i)).toHaveValue('')
  })

  it('Back returns to the picker', async () => {
    renderFlow()
    await userEvent.click(screen.getByRole('button', { name: /fox/i }))
    await userEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(screen.getByText('What did Natalie see?')).toBeInTheDocument()
  })

  it('saves with stored credentials: builds fields, calls onSave with header, fires onLogged', async () => {
    setCredentials('sekrit')
    const { onSave, onLogged } = renderFlow()
    await userEvent.click(screen.getByRole('button', { name: /fox/i }))
    await userEvent.type(screen.getByLabelText(/where/i), 'backyard')
    await userEvent.click(screen.getByRole('button', { name: /save sighting/i }))
    expect(onSave).toHaveBeenCalledWith(
      { emoji: '🦊', sightedOn: '2026-07-03', name: 'Fox', place: 'backyard' },
      'Basic ' + btoa('natalie:sekrit'),
    )
    expect(onLogged).toHaveBeenCalledTimes(1)
  })

  it('prompts for the password when no credentials are stored, then saves', async () => {
    const { onSave, onLogged } = renderFlow()
    await userEvent.click(screen.getByRole('button', { name: /fox/i }))
    await userEvent.click(screen.getByRole('button', { name: /save sighting/i }))
    expect(onSave).not.toHaveBeenCalled()
    await userEvent.type(screen.getByLabelText(/password/i), 'sekrit')
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(onSave).toHaveBeenCalledWith(expect.anything(), 'Basic ' + btoa('natalie:sekrit'))
    expect(onLogged).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('critter-write-auth')).not.toBeNull()
  })

  it('401 clears credentials and re-prompts with an error note, draft intact', async () => {
    setCredentials('wrong')
    const { onSave, onLogged } = renderFlow({
      onSave: vi.fn(async () => {
        throw new ApiError(401)
      }),
    })
    await userEvent.click(screen.getByRole('button', { name: /fox/i }))
    await userEvent.type(screen.getByLabelText(/where/i), 'trail')
    await userEvent.click(screen.getByRole('button', { name: /save sighting/i }))
    expect(await screen.findByText(/wrong password/i)).toBeInTheDocument()
    expect(localStorage.getItem('critter-write-auth')).toBeNull()
    expect(onLogged).not.toHaveBeenCalled()
    // draft intact behind the prompt
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.getByLabelText(/where/i)).toHaveValue('trail')
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('503 shows the writes-disabled message and keeps the sheet open', async () => {
    setCredentials('sekrit')
    const { onLogged, onClose } = renderFlow({
      onSave: vi.fn(async () => {
        throw new ApiError(503)
      }),
    })
    await userEvent.click(screen.getByRole('button', { name: /fox/i }))
    await userEvent.click(screen.getByRole('button', { name: /save sighting/i }))
    expect(await screen.findByText(/saving is disabled right now/i)).toBeInTheDocument()
    expect(onLogged).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('network failure shows a generic error and preserves the draft', async () => {
    setCredentials('sekrit')
    renderFlow({
      onSave: vi.fn(async () => {
        throw new TypeError('fetch failed')
      }),
    })
    await userEvent.click(screen.getByRole('button', { name: /fox/i }))
    await userEvent.type(screen.getByLabelText(/comment/i), 'so fluffy')
    await userEvent.click(screen.getByRole('button', { name: /save sighting/i }))
    expect(await screen.findByText(/couldn't save — try again/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/comment/i)).toHaveValue('so fluffy')
  })

  it('omits empty optional fields from the save payload', async () => {
    setCredentials('sekrit')
    const { onSave } = renderFlow()
    await userEvent.click(screen.getByRole('button', { name: /other/i }))
    await userEvent.click(screen.getByRole('button', { name: '🐝' }))
    await userEvent.click(screen.getByRole('button', { name: /save sighting/i }))
    expect(onSave).toHaveBeenCalledWith(
      { emoji: '🐝', sightedOn: '2026-07-03' },
      expect.any(String),
    )
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run --project client`
Expected: FAIL — cannot resolve `./LogSightingFlow`.

- [ ] **Step 3: Implement the three components**

`app/src/components/EmojiPicker.tsx`:

```tsx
import { useState } from 'react'
import { CURATED, EXTENDED } from '../lib/critters'

type Props = {
  onPick: (emoji: string, name: string | null) => void
  onCancel: () => void
}

export function EmojiPicker({ onPick, onCancel }: Props) {
  const [showExtended, setShowExtended] = useState(false)
  return (
    <div className="emoji-picker">
      <h2 className="sheet-heading">What did Natalie see?</h2>
      <div className="picker-grid">
        {CURATED.map((c) => (
          <button
            key={c.emoji}
            type="button"
            className="picker-tile"
            style={{ background: c.tint }}
            aria-label={c.name}
            onClick={() => onPick(c.emoji, c.name)}
          >
            {c.emoji}
          </button>
        ))}
        <button
          type="button"
          className="picker-tile picker-other"
          onClick={() => setShowExtended(true)}
        >
          Other
        </button>
      </div>
      {showExtended && (
        <>
          <hr className="picker-divider" />
          <div className="picker-grid picker-grid-extended">
            {EXTENDED.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="picker-tile"
                aria-label={emoji}
                onClick={() => onPick(emoji, null)}
              >
                {emoji}
              </button>
            ))}
          </div>
        </>
      )}
      <button type="button" className="btn-secondary flow-cancel" onClick={onCancel}>
        Cancel
      </button>
    </div>
  )
}
```

`app/src/components/DetailsForm.tsx`:

```tsx
import { useState } from 'react'
import type { NewSightingInput } from '../api'

type Props = {
  emoji: string
  initialName: string | null
  onBack: () => void
  onSave: (fields: NewSightingInput) => void
  saving: boolean
}

function today(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

export function DetailsForm({ emoji, initialName, onBack, onSave, saving }: Props) {
  const [name, setName] = useState(initialName ?? '')
  const [sightedOn, setSightedOn] = useState(today)
  const [sightedTime, setSightedTime] = useState('')
  const [place, setPlace] = useState('')
  const [comment, setComment] = useState('')

  function save() {
    const fields: NewSightingInput = { emoji, sightedOn }
    if (name !== '') fields.name = name
    if (sightedTime !== '') fields.sightedTime = sightedTime
    if (place !== '') fields.place = place
    if (comment !== '') fields.comment = comment
    onSave(fields)
  }

  return (
    <div className="details-form">
      <div className="details-head">
        <span className="details-emoji" aria-hidden="true">{emoji}</span>
        <label className="field grow">
          Critter name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Critter name" />
        </label>
      </div>
      <div className="details-row">
        <label className="field">
          Date
          <input type="date" value={sightedOn} onChange={(e) => setSightedOn(e.target.value)} />
        </label>
        <label className="field">
          Time
          <input value={sightedTime} onChange={(e) => setSightedTime(e.target.value)} placeholder="Time" />
        </label>
      </div>
      <label className="field">
        Where?
        <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Where? (backyard, trail...)" />
      </label>
      <label className="field">
        Comment
        <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Comment (optional)" />
      </label>
      <div className="details-actions">
        <button type="button" className="btn-secondary" onClick={onBack}>
          Back
        </button>
        <button type="button" className="btn-primary" onClick={save} disabled={saving}>
          Save sighting
        </button>
      </div>
    </div>
  )
}
```

`app/src/components/LogSightingFlow.tsx`:

```tsx
import { useState } from 'react'
import { ApiError, type NewSightingInput } from '../api'
import { basicHeader, clearCredentials, getCredentials, setCredentials } from '../auth'
import { PasswordPrompt } from './PasswordPrompt'
import { Sheet } from './Sheet'
import { DetailsForm } from './DetailsForm'
import { EmojiPicker } from './EmojiPicker'

type Props = {
  open: boolean
  onClose: () => void
  onSave: (fields: NewSightingInput, authHeader: string) => Promise<void>
  onLogged: () => void
}

type Picked = { emoji: string; name: string | null }

export function LogSightingFlow({ open, onClose, onSave, onLogged }: Props) {
  const [picked, setPicked] = useState<Picked | null>(null)
  const [pendingFields, setPendingFields] = useState<NewSightingInput | null>(null)
  const [promptError, setPromptError] = useState<string | null>(null)
  const [flowError, setFlowError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function reset() {
    setPicked(null)
    setPendingFields(null)
    setPromptError(null)
    setFlowError(null)
    setSaving(false)
  }

  function close() {
    reset()
    onClose()
  }

  async function attemptSave(fields: NewSightingInput, password?: string) {
    const creds = password !== undefined ? { user: 'natalie', password } : getCredentials()
    if (creds === null) {
      setPendingFields(fields)
      return
    }
    setSaving(true)
    setFlowError(null)
    try {
      await onSave(fields, basicHeader(creds))
      if (password !== undefined) setCredentials(password)
      reset()
      onLogged()
    } catch (err) {
      setSaving(false)
      if (err instanceof ApiError && err.status === 401) {
        clearCredentials()
        setPendingFields(fields)
        setPromptError('Wrong password — try again')
      } else if (err instanceof ApiError && err.status === 503) {
        setFlowError('Saving is disabled right now')
      } else {
        setFlowError("Couldn't save — try again")
      }
    }
  }

  // The draft lives in DetailsForm's state, so the form must stay MOUNTED while
  // the password prompt shows (401/no-creds paths preserve the draft). The
  // prompt therefore renders as an overlay inside the details branch, never as
  // a replacement for it — a prompt can only appear after Save, i.e. when the
  // details step is active.
  return (
    <Sheet open={open} onClose={close}>
      {picked === null ? (
        <EmojiPicker onPick={(emoji, name) => setPicked({ emoji, name })} onCancel={close} />
      ) : (
        <div className="flow-details">
          {flowError !== null && <p className="flow-error">{flowError}</p>}
          <DetailsForm
            key={picked.emoji + (picked.name ?? '')}
            emoji={picked.emoji}
            initialName={picked.name}
            saving={saving}
            onBack={() => setPicked(null)}
            onSave={(fields) => void attemptSave(fields)}
          />
          {pendingFields !== null && (
            <div className="prompt-overlay">
              <PasswordPrompt
                open
                error={promptError}
                onCancel={() => {
                  setPendingFields(null)
                  setPromptError(null)
                }}
                onSubmit={(password) => {
                  const fields = pendingFields
                  setPendingFields(null)
                  void attemptSave(fields, password)
                }}
              />
            </div>
          )}
        </div>
      )}
    </Sheet>
  )
}
```

- [ ] **Step 4: Append flow styles to `app/src/index.css`**

```css
.sheet-heading {
  font-family: 'Fredoka', sans-serif;
  font-weight: 600;
  font-size: 17px;
  margin: 4px 0 12px;
}

.picker-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}

.picker-grid-extended {
  grid-template-columns: repeat(6, 1fr);
}

.picker-tile {
  aspect-ratio: 1;
  border-radius: 14px;
  border: 1px solid var(--border-hairline);
  background: #fff;
  font-size: 22px;
  cursor: pointer;
}

.picker-other {
  border: 1px dashed var(--other-border);
  background: var(--surface-input);
  color: var(--other-text);
  font-size: 12px;
  font-weight: 700;
}

.picker-divider {
  border: none;
  border-top: 1px solid var(--border-hairline);
  margin: 14px 0;
}

.flow-cancel {
  width: 100%;
  margin-top: 14px;
}

.flow-error {
  color: var(--danger-text);
  background: var(--danger-bg);
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 700;
}

.flow-details {
  position: relative;
}

.prompt-overlay {
  position: absolute;
  inset: 0;
  background: #fff;
  border-radius: 14px;
}

.details-head {
  display: flex;
  gap: 12px;
  align-items: center;
}

.details-emoji {
  font-size: 34px;
}

.details-row {
  display: flex;
  gap: 10px;
}

.details-row .field {
  flex: 1;
}

.field {
  display: block;
  margin-top: 10px;
  font-size: 12px;
  font-weight: 700;
  color: var(--ink-secondary);
}

.field.grow {
  flex: 1;
  margin-top: 0;
}

.field input,
.field textarea {
  display: block;
  width: 100%;
  box-sizing: border-box;
  margin-top: 4px;
  padding: 10px;
  border: 1px solid var(--border-hairline);
  border-radius: 14px;
  background: var(--surface-input);
  font: inherit;
  color: var(--ink);
}

.details-actions {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}
```

- [ ] **Step 5: Run to verify pass, lint, typecheck, commit**

```bash
pnpm vitest run --project client && pnpm lint && pnpm typecheck
git add app/src/components app/src/index.css
git commit -m "feat: two-step log-a-sighting flow with auth prompting"
```

---

### Task 7: Shell — Header, Tabs, RecentCritters, App composition, responsive layout

**Files:**
- Create: `app/src/components/Header.tsx`, `app/src/components/Tabs.tsx`, `app/src/components/RecentCritters.tsx`, `app/src/components/PlaceholderPane.tsx`
- Modify: `app/src/App.tsx` (full replacement), `app/src/index.css` (replace legacy shell/status styles with the layout below), `app/src/App.test.tsx` (full replacement — health-page tests retire with the health UI)
- Test: `app/src/App.test.tsx`, `app/src/components/RecentCritters.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 2–6.
- Produces: the shipped page. `Tab = 'calendar' | 'history' | 'leaderboard'`; `Tabs: { active: Tab; onChange(tab: Tab): void }`; `RecentCritters: { sightings: Sighting[]; status: 'loading' | 'ready' | 'error'; onRetry(): void }` (renders at most 4). Next cycle's calendar replaces `PlaceholderPane` in the calendar slot.

- [ ] **Step 1: Write the failing tests**

`app/src/components/RecentCritters.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Sighting } from '../api'
import { RecentCritters } from './RecentCritters'

function row(overrides: Partial<Sighting>): Sighting {
  return {
    id: crypto.randomUUID(), emoji: '🦊', name: 'Fox', sightedOn: '2026-07-03',
    sightedTime: null, place: null, comment: null, photoPath: null,
    createdAt: '2026-07-03T12:00:00.000Z', ...overrides,
  }
}

describe('RecentCritters', () => {
  it('renders at most 4 rows, most recent first, with formatted meta', () => {
    const sightings = [
      row({ name: 'Fox', sightedTime: 'dusk' }),
      row({ name: 'Owl', emoji: '🦉' }),
      row({ name: 'Deer', emoji: '🦌' }),
      row({ name: 'Duck', emoji: '🦆' }),
      row({ name: 'Frog', emoji: '🐸' }),
    ]
    render(<RecentCritters sightings={sightings} status="ready" onRetry={() => {}} />)
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(4)
    expect(items[0]).toHaveTextContent('Fox')
    expect(items[0]).toHaveTextContent('Jul 3 · dusk')
    expect(items[1]).toHaveTextContent('Jul 3 · just now')
    expect(screen.queryByText('Frog')).not.toBeInTheDocument()
  })

  it('falls back to the emoji when name is null', () => {
    render(<RecentCritters sightings={[row({ name: null })]} status="ready" onRetry={() => {}} />)
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('🦊')
  })

  it('shows the empty state when there are no sightings', () => {
    render(<RecentCritters sightings={[]} status="ready" onRetry={() => {}} />)
    expect(screen.getByText(/no critters yet/i)).toBeInTheDocument()
  })

  it('shows error state with a retry button', async () => {
    const onRetry = vi.fn()
    render(<RecentCritters sightings={[]} status="error" onRetry={onRetry} />)
    expect(screen.getByText(/couldn't load sightings/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
```

`app/src/App.test.tsx` (full replacement):

```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { setCredentials } from './auth'

const ROW = {
  id: '3f9a26cc-1c0e-4c3a-9b52-08a1c2f4d9aa', emoji: '🦊', name: 'Fox',
  sightedOn: '2026-07-02', sightedTime: null, place: null, comment: null,
  photoPath: null, createdAt: '2026-07-02T12:00:00.000Z',
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-07-03T15:00:00'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  localStorage.clear()
})

function stubFetchQueue(responses: Array<{ status: number; body: unknown }>) {
  const queue = [...responses]
  vi.stubGlobal('fetch', vi.fn(async () => {
    const next = queue.shift() ?? { status: 500, body: { error: 'internal' } }
    return new Response(JSON.stringify(next.body), { status: next.status })
  }))
}

describe('App shell', () => {
  it('renders header, three tabs, log button, and the calendar placeholder by default', async () => {
    stubFetchQueue([{ status: 200, body: [ROW] }])
    render(<App />)
    expect(screen.getByText('🐾 Natalie Saw a Critter!')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Calendar' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'History' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Top Critters' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /log a sighting/i }).length).toBeGreaterThan(0)
    expect(await screen.findByText('Fox')).toBeInTheDocument()
  })

  it('switches tabs to placeholder panes', async () => {
    stubFetchQueue([{ status: 200, body: [] }])
    render(<App />)
    await userEvent.click(screen.getByRole('tab', { name: 'History' }))
    expect(screen.getByRole('tab', { name: 'History' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument()
  })

  it('full happy path: log a fox, toast appears, fox lands in Recent Critters', async () => {
    setCredentials('sekrit')
    const created = { ...ROW, id: '00000000-0000-4000-8000-000000000002', sightedOn: '2026-07-03' }
    stubFetchQueue([
      { status: 200, body: [] },
      { status: 201, body: created },
    ])
    render(<App />)
    await userEvent.click(screen.getAllByRole('button', { name: /log a sighting/i })[0])
    await userEvent.click(screen.getByRole('button', { name: /fox/i }))
    await userEvent.click(screen.getByRole('button', { name: /save sighting/i }))
    expect(await screen.findByRole('status')).toHaveTextContent('🎉 Logged!')
    const recent = screen.getAllByTestId('recent-critters')[0]
    expect(within(recent).getByText('Fox')).toBeInTheDocument()
    // sheet closed
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('toast auto-dismisses after ~1.8s', async () => {
    setCredentials('sekrit')
    stubFetchQueue([
      { status: 200, body: [] },
      { status: 201, body: { ...ROW, sightedOn: '2026-07-03' } },
    ])
    render(<App />)
    await userEvent.click(screen.getAllByRole('button', { name: /log a sighting/i })[0])
    await userEvent.click(screen.getByRole('button', { name: /fox/i }))
    await userEvent.click(screen.getByRole('button', { name: /save sighting/i }))
    expect(await screen.findByRole('status')).toBeInTheDocument()
    await vi.advanceTimersByTimeAsync(2000)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run --project client`
Expected: FAIL — `RecentCritters` missing; App tests fail against the old health page.

- [ ] **Step 3: Implement the components**

`app/src/components/Header.tsx`:

```tsx
export function Header() {
  return (
    <header className="app-header">
      <h1>🐾 Natalie Saw a Critter!</h1>
    </header>
  )
}
```

`app/src/components/Tabs.tsx`:

```tsx
export type Tab = 'calendar' | 'history' | 'leaderboard'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'calendar', label: 'Calendar' },
  { id: 'history', label: 'History' },
  { id: 'leaderboard', label: 'Top Critters' },
]

type Props = { active: Tab; onChange: (tab: Tab) => void }

export function Tabs({ active, onChange }: Props) {
  return (
    <nav className="tab-bar" role="tablist">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          className={`tab tab-${t.id}${active === t.id ? ' tab-active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </nav>
  )
}
```

`app/src/components/PlaceholderPane.tsx`:

```tsx
type Props = { label: string }

export function PlaceholderPane({ label }: Props) {
  return (
    <section className="card placeholder-pane">
      <p>
        {label} coming soon 🐾
      </p>
    </section>
  )
}
```

`app/src/components/RecentCritters.tsx`:

```tsx
import type { Sighting } from '../api'
import { formatWhen } from '../lib/format'

type Props = {
  sightings: Sighting[]
  status: 'loading' | 'ready' | 'error'
  onRetry: () => void
}

export function RecentCritters({ sightings, status, onRetry }: Props) {
  return (
    <section className="recent-critters" data-testid="recent-critters">
      <h2>Recent Critters</h2>
      {status === 'loading' && <p className="muted">Checking the burrow…</p>}
      {status === 'error' && (
        <p className="muted">
          Couldn't load sightings 😿{' '}
          <button type="button" className="link-button" onClick={onRetry}>
            Retry
          </button>
        </p>
      )}
      {status === 'ready' && sightings.length === 0 && (
        <p className="muted">No critters yet — log the first one!</p>
      )}
      {status === 'ready' && sightings.length > 0 && (
        <ul className="recent-list">
          {sightings.slice(0, 4).map((s) => (
            <li key={s.id} className="recent-row">
              <span className="recent-emoji" aria-hidden="true">{s.emoji}</span>
              <span className="recent-main">
                <span className="recent-name">{s.name ?? s.emoji}</span>
                <span className="recent-meta">{formatWhen(s.sightedOn, s.sightedTime)}</span>
              </span>
              <span className="recent-chevron" aria-hidden="true">›</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
```

`app/src/App.tsx` (full replacement):

```tsx
import { useEffect, useRef, useState } from 'react'
import { Header } from './components/Header'
import { LogSightingFlow } from './components/LogSightingFlow'
import { PlaceholderPane } from './components/PlaceholderPane'
import { RecentCritters } from './components/RecentCritters'
import { Tabs, type Tab } from './components/Tabs'
import { Toast } from './components/Toast'
import { useSightings } from './hooks/useSightings'

const PANE_LABELS: Record<Tab, string> = {
  calendar: 'Calendar',
  history: 'History',
  leaderboard: 'Top Critters',
}

export default function App() {
  const { sightings, status, addSighting, retry } = useSightings()
  const [activeTab, setActiveTab] = useState<Tab>('calendar')
  const [logOpen, setLogOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(toastTimer.current), [])

  function showToast(message: string) {
    setToast(message)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 1800)
  }

  const logButton = (
    <button type="button" className="log-button" onClick={() => setLogOpen(true)}>
      + Log a sighting
    </button>
  )

  return (
    <div className="page">
      <div className="shell">
        <Header />
        <Tabs active={activeTab} onChange={setActiveTab} />
        <div className="columns">
          <main className="main-col">
            <div className="mobile-only">{logButton}</div>
            <PlaceholderPane label={PANE_LABELS[activeTab]} />
            {activeTab === 'calendar' && (
              <div className="mobile-only">
                <RecentCritters sightings={sightings} status={status} onRetry={retry} />
              </div>
            )}
          </main>
          <aside className="sidebar desktop-only">
            {logButton}
            <RecentCritters sightings={sightings} status={status} onRetry={retry} />
          </aside>
        </div>
      </div>
      <LogSightingFlow
        open={logOpen}
        onClose={() => setLogOpen(false)}
        onSave={addSighting}
        onLogged={() => {
          setLogOpen(false)
          showToast('🎉 Logged!')
        }}
      />
      <Toast message={toast} />
    </div>
  )
}
```

- [ ] **Step 4: Replace the legacy layout CSS in `app/src/index.css`**

Remove the old `.shell`, `.header`, `.header h1`, `.status` rules and add:

```css
body {
  margin: 0;
  min-height: 100vh;
  background: linear-gradient(180deg, #eaf6ff, #fdf1ff);
  color: var(--ink);
  font-family: 'Quicksand', sans-serif;
}

.page {
  max-width: 480px;
  margin: 0 auto;
  padding: 16px 12px 60px;
}

.shell {
  background: #fff;
  border-radius: 24px 24px 18px 18px;
  box-shadow: var(--shadow-shell);
  overflow: hidden;
  padding-bottom: 16px;
}

.app-header {
  background: var(--rainbow);
  padding: 18px;
  text-align: center;
}

.app-header h1 {
  margin: 0;
  font-family: 'Fredoka', sans-serif;
  font-weight: 600;
  font-size: 18px;
  color: var(--ink);
}

.tab-bar {
  display: flex;
  background: #fff;
  border-bottom: 1px solid var(--border-hairline);
}

.tab {
  flex: 1;
  padding: 12px 0 9px;
  border: none;
  background: none;
  font-family: 'Quicksand', sans-serif;
  font-weight: 700;
  font-size: 13px;
  color: var(--ink-secondary);
  border-bottom: 3px solid transparent;
  cursor: pointer;
}

.tab-active.tab-calendar { color: var(--tab-calendar); border-bottom-color: var(--tab-calendar); }
.tab-active.tab-history { color: var(--tab-history); border-bottom-color: var(--tab-history); }
.tab-active.tab-leaderboard { color: var(--tab-leaderboard); border-bottom-color: var(--tab-leaderboard); }

.columns {
  padding: 14px 14px 0;
}

.log-button {
  display: block;
  width: 100%;
  padding: 13px;
  border: none;
  border-radius: 14px;
  background: var(--rainbow);
  color: var(--ink);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  margin-bottom: 14px;
}

.card {
  background: #fff;
  border: 1px solid var(--border-hairline);
  border-radius: 18px;
  box-shadow: var(--shadow-card);
}

.placeholder-pane {
  padding: 36px 16px;
  text-align: center;
  color: var(--ink-secondary);
  font-weight: 700;
}

.recent-critters h2 {
  font-family: 'Fredoka', sans-serif;
  font-weight: 600;
  font-size: 14px;
  margin: 16px 0 8px;
}

.recent-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.recent-row {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #fff;
  border: 1px solid var(--border-hairline);
  border-radius: 14px;
  padding: 10px 12px;
}

.recent-emoji { font-size: 20px; }
.recent-main { flex: 1; display: flex; flex-direction: column; }
.recent-name { font-size: 13px; font-weight: 700; }
.recent-meta { font-size: 11px; color: var(--ink-secondary); }
.recent-chevron { color: #c6d2ee; font-size: 18px; }

.muted { color: var(--ink-secondary); font-size: 13px; }

.link-button {
  border: none;
  background: none;
  color: var(--other-text);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  text-decoration: underline;
}

.mobile-only { display: block; }
.desktop-only { display: none; }

@media (min-width: 880px) {
  .page { max-width: 1100px; padding: 32px 24px 60px; }
  .columns { display: flex; gap: 24px; }
  .main-col { flex: 1; }
  .sidebar { width: 280px; flex-shrink: 0; }
  .mobile-only { display: none; }
  .desktop-only { display: block; }
}
```

- [ ] **Step 5: Run to verify pass, full suite, commit**

```bash
pnpm vitest run --project client && pnpm lint && pnpm typecheck && pnpm test && pnpm build
git add app/src
git commit -m "feat: app shell with tabs, responsive layout, and recent critters"
```

---

### Task 8: End-to-end verification (spec Definition of Done)

**Files:** none (verification only; fix-forward commits allowed if the smoke finds transcription bugs)

**Interfaces:** consumes the full stack.

- [ ] **Step 1: Compose smoke with the real UI**

From the repo root (`.env` exists with POSTGRES_PASSWORD/WRITE_USER/WRITE_PASSWORD set):

```bash
docker compose up -d --build
sleep 2
curl -s http://localhost:8080/api/health
```

Expected: `{"ok":true,"db":true}`.

- [ ] **Step 2: Drive the flow through the served client**

Verify the built page serves and the API round-trips with the UI's exact request shape:

```bash
PASS=$(grep '^WRITE_PASSWORD=' .env | cut -d= -f2)
curl -s http://localhost:8080/ | grep -o '<title>[^<]*</title>'
curl -s -X POST -u "natalie:$PASS" -H 'content-type: application/json' \
  -d '{"emoji":"🦊","sightedOn":"2026-07-03","name":"Fox","place":"backyard"}' \
  http://localhost:8080/api/sightings | head -c 200
curl -s http://localhost:8080/api/sightings | head -c 300
```

Expected: title "Natalie Saw a Critter!", a 201 body, the fox in the list.

Then a real browser pass (this is the DoD's visual check — a human or a browser tool):
open http://localhost:8080 at phone width — tap "+ Log a sighting", pick 🦊, save,
enter the WRITE_PASSWORD when prompted, see "🎉 Logged!" and Fox in Recent Critters;
reload — Fox persists; widen past 880px — two-column layout with sidebar. Compare
against `docs/design/screenshots/log-sighting.png` and the prototype shell.

- [ ] **Step 3: Clean up test rows and stop the stack**

```bash
PASS=$(grep '^WRITE_PASSWORD=' .env | cut -d= -f2)
for id in $(curl -s http://localhost:8080/api/sightings | python3 -c "import json,sys; [print(s['id']) for s in json.load(sys.stdin)]"); do
  curl -s -X DELETE -u "natalie:$PASS" -o /dev/null http://localhost:8080/api/sightings/$id
done
docker compose down
```

Expected: empty list before `down`; volumes intact.

- [ ] **Step 4: Full verification**

Run (from `app/`): `pnpm lint && pnpm typecheck && pnpm test:coverage && pnpm build`
Expected: all green.

---

## Final verification (spec Definition of Done)

- [ ] Phone-width: log 🦊 → password prompt (first time) → "🎉 Logged!" → Fox tops Recent Critters. Desktop ≥880px shows two columns + sidebar. (Task 8 Step 2)
- [ ] Wrong-password path verified by the 401 component test (Task 6) — optionally re-verify live with a bad password in the browser.
- [ ] `pnpm test`, lint, typecheck, build green; CI green on the PR.
- [ ] Visual check against the design screenshots/prototype done.
