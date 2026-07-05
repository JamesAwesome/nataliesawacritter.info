# Logging Improvements + Critter Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Native time picker + "Now", a two-layer future-date guard, and server-backed critter profiles ("friends" like Mr Fox) surfaced in the picker, per `docs/superpowers/specs/2026-07-04-logging-profiles-design.md`.

**Architecture:** The time/date fixes are client-side (format helpers + DetailsForm) plus a three-line server validation. Profiles mirror the sightings vertical exactly: drizzle migration → `profiles/{store,routes}.ts` → `createApp` dep → `api.ts` + `useProfiles` hook → picker Friends row + a save/remove-friend toggle in SightingDetail (via a second `useWriteAction` instance so delete copy stays untouched).

**Tech Stack:** React 19, TypeScript 6, Express 5, Drizzle 0.45, Vitest 4 + Testcontainers. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-04-logging-profiles-design.md`

## Global Constraints

- pnpm 11.9.0 only, from `app/`. Raw vitest invocations REQUIRE `NODE_OPTIONS=--no-experimental-webstorage` (pnpm test scripts already carry it). Server-side relative imports use `.js` extensions.
- Copy exact: time stored as e.g. `"2:30 PM"` (12-hour, space, uppercase AM/PM); server future error `sightedOn: 'must not be in the future'`; profile conflict `{"error":"conflict"}` (409); picker heading `"Friends"`; SightingDetail buttons `"⭐ Save as friend"` / `"Remove friend"`.
- Length caps (UTF-16 units): profile `emoji` ≤16, `name` ≤100 (REQUIRED), `place` ≤100 (optional, `''`→null). Unknown POST fields rejected. Error envelopes identical to sightings.
- Friend match = same `emoji` AND same `name`. DB unique index on (emoji, name); Postgres unique violation = SQLSTATE `23505`.
- FROZEN test files (must pass byte-unchanged): `app/src/components/LogSightingFlow.test.tsx` (friends prop optional), `app/src/components/DetailsForm.test.tsx`'s existing tests (new props optional; new tests may be APPENDED to that file).
- No raw hexes in TSX. Working directory: the repo (or its worktree copy).

---

### Task 1: Time picker + client future-date guard

**Files:**
- Modify: `app/src/lib/format.ts`, `app/src/components/DetailsForm.tsx`, `app/src/index.css`
- Test: `app/src/lib/format.test.ts` (append), `app/src/components/DetailsForm.test.tsx` (append)

**Interfaces:**
- Produces: `formatClockTime(hhmm: string): string` and `nowClockTime(): string` from `lib/format`; DetailsForm's Time field is `<input type="time">` + a "Now" button; saved payload carries the friendly string; date input has `max={today()}` and Save disables when the date is in the future. `initialPlace?: string | null` is NOT this task (Task 6).

- [ ] **Step 1: Write the failing format tests**

Append to `app/src/lib/format.test.ts` (file already imports from `./format`; `useFakeClock` comes from `../test/helpers`):

```ts
import { useFakeClock } from '../test/helpers'
import { formatClockTime, nowClockTime } from './format'

describe('formatClockTime', () => {
  it('converts 24h HH:MM to a friendly 12-hour string', () => {
    expect(formatClockTime('14:30')).toBe('2:30 PM')
    expect(formatClockTime('00:05')).toBe('12:05 AM')
    expect(formatClockTime('12:00')).toBe('12:00 PM')
    expect(formatClockTime('09:07')).toBe('9:07 AM')
    expect(formatClockTime('23:59')).toBe('11:59 PM')
  })

  it('returns non-HH:MM input unchanged (defensive passthrough)', () => {
    expect(formatClockTime('dusk')).toBe('dusk')
    expect(formatClockTime('')).toBe('')
    expect(formatClockTime('25:00')).toBe('25:00')
  })
})

describe('nowClockTime', () => {
  useFakeClock() // fixed at 2026-07-03T15:00:00 local

  it('returns the current local time as HH:MM', () => {
    expect(nowClockTime()).toBe('15:00')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run (from `app/`): `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client`
Expected: FAIL — `formatClockTime`/`nowClockTime` not exported.

- [ ] **Step 3: Implement the helpers**

Append to `app/src/lib/format.ts`:

```ts
const CLOCK_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

/** '14:30' → '2:30 PM'. Non-HH:MM input passes through unchanged. */
export function formatClockTime(hhmm: string): string {
  const match = CLOCK_RE.exec(hhmm)
  if (match === null) return hhmm
  const hour24 = Number(match[1])
  const suffix = hour24 < 12 ? 'AM' : 'PM'
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  return `${hour12}:${match[2]} ${suffix}`
}

/** Current local time as 'HH:MM' (the value shape <input type="time"> uses). */
export function nowClockTime(): string {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}
```

- [ ] **Step 4: Append the failing DetailsForm tests**

Append inside the existing `describe('DetailsForm', ...)` in `app/src/components/DetailsForm.test.tsx` (file already has `useFakeClock()` and imports `render/screen/fireEvent/vi`; add `userEvent` import if missing):

```tsx
  it('Now fills the time input and the payload carries the friendly string', async () => {
    const onSave = vi.fn()
    render(<DetailsForm emoji="🦊" initialName="Fox" onBack={() => {}} onSave={onSave} saving={false} />)
    await userEvent.click(screen.getByRole('button', { name: /now/i }))
    expect(screen.getByLabelText('Time')).toHaveValue('15:00')
    await userEvent.click(screen.getByRole('button', { name: /save sighting/i }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ sightedTime: '3:00 PM' }))
  })

  it('omits sightedTime when the time input is blank', async () => {
    const onSave = vi.fn()
    render(<DetailsForm emoji="🦊" initialName="Fox" onBack={() => {}} onSave={onSave} saving={false} />)
    await userEvent.click(screen.getByRole('button', { name: /save sighting/i }))
    expect(onSave).toHaveBeenCalledWith({ emoji: '🦊', sightedOn: '2026-07-03', name: 'Fox' })
  })

  it('disables Save for a future date and sets max on the date input', () => {
    const onSave = vi.fn()
    render(<DetailsForm emoji="🦊" initialName="Fox" onBack={() => {}} onSave={onSave} saving={false} />)
    expect(screen.getByLabelText('Date')).toHaveAttribute('max', '2026-07-03')
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-08-01' } })
    expect(screen.getByRole('button', { name: /save sighting/i })).toBeDisabled()
  })
```

- [ ] **Step 5: Run to verify failure, then modify DetailsForm**

In `app/src/components/DetailsForm.tsx`:
- Add import: `import { formatClockTime, nowClockTime } from '../lib/format'`.
- In `save()`, change the sightedTime line to convert: `if (sightedTime !== '') fields.sightedTime = formatClockTime(sightedTime)`.
- Replace the Date and Time fields (the `details-row` block) with:

```tsx
      <div className="details-row">
        <label className="field">
          Date
          <input
            type="date"
            value={sightedOn}
            max={today()}
            onChange={(e) => setSightedOn(e.target.value)}
          />
        </label>
        <label className="field">
          Time
          <div className="time-row">
            <input
              type="time"
              value={sightedTime}
              onChange={(e) => setSightedTime(e.target.value)}
            />
            <button type="button" className="btn-secondary btn-now" onClick={() => setSightedTime(nowClockTime())}>
              Now
            </button>
          </div>
        </label>
      </div>
```

- Change the Save button's disabled expression to: `disabled={saving || sightedOn === '' || sightedOn > today()}`.

Append CSS to `app/src/index.css`:

```css
.time-row {
  display: flex;
  gap: 6px;
  margin-top: 4px;
}

.time-row input {
  flex: 1;
  margin-top: 0;
}

.btn-now {
  flex: 0 0 auto;
  padding: 10px 12px;
}
```

- [ ] **Step 6: Full client run (existing DetailsForm + LogSightingFlow tests must pass unchanged), lint, typecheck, commit**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client && pnpm lint && pnpm typecheck`
Expected: all green; `git status` confirms LogSightingFlow.test.tsx untouched.

```bash
git add app/src/lib/format.ts app/src/lib/format.test.ts app/src/components/DetailsForm.tsx app/src/components/DetailsForm.test.tsx app/src/index.css
git commit -m "feat: native time picker with Now button; client future-date guard"
```

---

### Task 2: Server future-date guard

**Files:**
- Modify: `app/server/sightings/routes.ts`
- Test: `app/server/sightings/routes.test.ts` (append)

**Interfaces:**
- Produces: POST /api/sightings rejects `sightedOn` later than UTC today + 1 day with details `{ sightedOn: 'must not be in the future' }` in the standard 400 envelope. No other behavior changes.

- [ ] **Step 1: Append the failing tests**

In `app/server/sightings/routes.test.ts`, append to the `describe('POST /api/sightings', ...)` block (imports `vi` already; add `beforeEach/afterEach` from vitest if missing):

```ts
  describe('future dates', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-07-04T12:00:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('accepts today and UTC today + 1 (timezone grace)', async () => {
      const store = fakeStore()
      await withServer(appWith(store), async (base) => {
        for (const sightedOn of ['2026-07-04', '2026-07-05']) {
          const res = await post(base, { emoji: '🦊', sightedOn })
          expect(res.status).toBe(201)
        }
      })
    })

    it('rejects dates beyond UTC today + 1', async () => {
      const store = fakeStore()
      await withServer(appWith(store), async (base) => {
        const res = await post(base, { emoji: '🦊', sightedOn: '2026-07-06' })
        expect(res.status).toBe(400)
        expect((await res.json() as { details: Record<string, string> }).details.sightedOn).toBe(
          'must not be in the future',
        )
        expect(store.create).not.toHaveBeenCalled()
      })
    })
  })
```

(The file's existing `post` helper and `VALID` constant use a fixed past date, so existing tests are unaffected by the fake clock being scoped to this inner describe.)

- [ ] **Step 2: Run to verify failure**

Run (from `app/`): `pnpm vitest run --project unit`
Expected: the reject test FAILS (currently 201).

- [ ] **Step 3: Implement**

In `app/server/sightings/routes.ts`, add below `isValidDate`:

```ts
/** Latest permitted sightedOn: UTC today + 1 day (grace for clients ahead of UTC). */
function maxAllowedDate(): string {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
    .toISOString()
    .slice(0, 10)
}
```

and change the sightedOn validation in `parseNewSighting` to:

```ts
  const sightedOn = record.sightedOn
  if (typeof sightedOn !== 'string' || !isValidDate(sightedOn)) {
    details.sightedOn = 'required, must be YYYY-MM-DD'
  } else if (sightedOn > maxAllowedDate()) {
    details.sightedOn = 'must not be in the future'
  }
```

- [ ] **Step 4: Run unit + integration, lint, typecheck, commit**

Run: `pnpm vitest run --project unit && pnpm vitest run --project integration && pnpm lint && pnpm typecheck`
Expected: all green (integration tests use past dates).

```bash
git add app/server/sightings/routes.ts app/server/sightings/routes.test.ts
git commit -m "feat: reject future sightedOn server-side with UTC+1 grace"
```

---

### Task 3: critter_profiles schema, migration, store (Testcontainers TDD)

**Files:**
- Modify: `app/server/db/schema.ts`
- Create: `app/server/profiles/store.ts`, generated migration in `app/drizzle/`
- Test: `app/server/profiles/store.integration.test.ts`

**Interfaces:**
- Consumes: `createTestDb` from `../testDb.js`; drizzle `pgTable/uniqueIndex`.
- Produces (Tasks 4–5 rely on):

```ts
// schema.ts adds:
export const critterProfiles = pgTable(...)  // id uuid PK, emoji NOT NULL, name NOT NULL, place NULL, created_at; UNIQUE (emoji, name)
// profiles/store.ts:
export type NewProfile = { emoji: string; name: string; place: string | null }
export type Profile = typeof critterProfiles.$inferSelect
export type ProfileCreateResult = { ok: true; row: Profile } | { ok: false; conflict: true }
export function createProfilesStore(db: NodePgDatabase<typeof schema>): {
  list(): Promise<Profile[]>                       // created_at DESC
  create(fields: NewProfile): Promise<ProfileCreateResult>
  remove(id: string): Promise<boolean>
}
export type ProfilesStore = ReturnType<typeof createProfilesStore>
```

- [ ] **Step 1: Write the failing integration test**

`app/server/profiles/store.integration.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from '../testDb.js'
import type { createDb } from '../db/index.js'
import { critterProfiles } from '../db/schema.js'
import { createProfilesStore, type ProfilesStore } from './store.js'

describe('profiles store', () => {
  let handle: ReturnType<typeof createDb>
  let store: ProfilesStore

  beforeAll(async () => {
    handle = await createTestDb()
    store = createProfilesStore(handle.db)
  })

  afterAll(async () => {
    await handle?.pool.end()
  })

  beforeEach(async () => {
    await handle.db.delete(critterProfiles)
  })

  it('creates and lists profiles most-recent-first', async () => {
    const first = await store.create({ emoji: '🦊', name: 'Mr Fox', place: 'train station' })
    const second = await store.create({ emoji: '🦉', name: 'Professor Hoot', place: null })
    expect(first).toMatchObject({ ok: true })
    expect(second).toMatchObject({ ok: true })
    const rows = await store.list()
    expect(rows.map((p) => p.name)).toEqual(['Professor Hoot', 'Mr Fox'])
    expect(rows[1].place).toBe('train station')
    expect(rows[1].id).toMatch(/^[0-9a-f]{8}-/)
  })

  it('signals conflict for a duplicate emoji+name and allows same name with another emoji', async () => {
    await store.create({ emoji: '🦊', name: 'Mr Fox', place: null })
    expect(await store.create({ emoji: '🦊', name: 'Mr Fox', place: 'elsewhere' })).toEqual({
      ok: false,
      conflict: true,
    })
    expect(await store.create({ emoji: '🐺', name: 'Mr Fox', place: null })).toMatchObject({ ok: true })
    expect(await store.list()).toHaveLength(2)
  })

  it('remove returns true then false', async () => {
    const created = await store.create({ emoji: '🦊', name: 'Mr Fox', place: null })
    if (!created.ok) throw new Error('setup failed')
    expect(await store.remove(created.row.id)).toBe(true)
    expect(await store.remove(created.row.id)).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run (from `app/`): `pnpm vitest run --project integration`
Expected: FAIL — `./store.js` unresolved.

- [ ] **Step 3: Add the schema table and generate the migration**

Append to `app/server/db/schema.ts` (add `uniqueIndex` to the pg-core import):

```ts
export const critterProfiles = pgTable(
  'critter_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    emoji: text('emoji').notNull(),
    name: text('name').notNull(),
    place: text('place'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('critter_profiles_emoji_name_idx').on(table.emoji, table.name)],
)
```

Run: `pnpm db:generate --name critter-profiles`
Expected: a new `app/drizzle/0001_critter-profiles.sql` (or similarly numbered) creating the table + unique index, plus updated `meta/`. Inspect the SQL: `CREATE TABLE "critter_profiles"` with the NOT NULLs and `CREATE UNIQUE INDEX ... ON "critter_profiles" ("emoji","name")`. Commit the generated files with this task.

- [ ] **Step 4: Implement the store**

`app/server/profiles/store.ts`:

```ts
import { desc, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '../db/schema.js'
import { critterProfiles } from '../db/schema.js'

export type NewProfile = { emoji: string; name: string; place: string | null }
export type Profile = typeof critterProfiles.$inferSelect
export type ProfileCreateResult = { ok: true; row: Profile } | { ok: false; conflict: true }

/** Postgres unique-violation is SQLSTATE 23505; drizzle may wrap the pg error, so walk causes. */
function isUniqueViolation(err: unknown): boolean {
  for (let e = err; typeof e === 'object' && e !== null; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: unknown }).code === '23505') return true
  }
  return false
}

export function createProfilesStore(db: NodePgDatabase<typeof schema>) {
  return {
    async list(): Promise<Profile[]> {
      return db.select().from(critterProfiles).orderBy(desc(critterProfiles.createdAt))
    },

    async create(fields: NewProfile): Promise<ProfileCreateResult> {
      try {
        const [row] = await db.insert(critterProfiles).values(fields).returning()
        return { ok: true, row }
      } catch (err) {
        if (isUniqueViolation(err)) return { ok: false, conflict: true }
        throw err
      }
    },

    async remove(id: string): Promise<boolean> {
      const removed = await db
        .delete(critterProfiles)
        .where(eq(critterProfiles.id, id))
        .returning({ id: critterProfiles.id })
      return removed.length > 0
    },
  }
}

export type ProfilesStore = ReturnType<typeof createProfilesStore>
```

- [ ] **Step 5: Run integration to verify pass, lint, typecheck, commit**

```bash
pnpm vitest run --project integration && pnpm lint && pnpm typecheck
git add app/server/db/schema.ts app/drizzle app/server/profiles
git commit -m "feat: critter_profiles table, migration, and store with conflict detection"
```

---

### Task 4: Profiles routes + app wiring + seam test + docs

**Files:**
- Create: `app/server/profiles/routes.ts`, `app/server/profiles/api.integration.test.ts`
- Modify: `app/server/app.ts` (deps + mount), `app/server/index.ts` (construct store), `app/server/app.test.ts` (deps helper), `README.md` (API section)
- Test: `app/server/profiles/routes.test.ts`

**Interfaces:**
- Consumes: `ProfilesStore`/`NewProfile`/`Profile` (Task 3); `basic`/`withServer` from `../testUtils.js`; `errorHandler`.
- Produces: `profilesRouter(store: ProfilesStore, writeGate: RequestHandler): Router`; `AppDeps` gains `profilesStore: ProfilesStore`; endpoints per the spec (GET public; POST auth 201/400/409; DELETE auth 204/404/400).

- [ ] **Step 1: Write the failing routes unit tests**

`app/server/profiles/routes.test.ts`:

```ts
import express, { type Express, type RequestHandler } from 'express'
import { describe, expect, it, vi } from 'vitest'
import { requireWriteAuth } from '../auth.js'
import { errorHandler } from '../errorHandler.js'
import { basic, withServer } from '../testUtils.js'
import { profilesRouter } from './routes.js'
import type { Profile, ProfilesStore } from './store.js'

const FIXED_ID = '3f9a26cc-1c0e-4c3a-9b52-08a1c2f4d9aa'

function rowFor(fields: { emoji: string; name: string; place: string | null }): Profile {
  return { ...fields, id: FIXED_ID, createdAt: new Date('2026-07-04T12:00:00Z') }
}

function fakeStore(overrides: Partial<ProfilesStore> = {}): ProfilesStore {
  return {
    list: vi.fn(async () => []),
    create: vi.fn(async (fields) => ({ ok: true as const, row: rowFor(fields) })),
    remove: vi.fn(async () => true),
    ...overrides,
  }
}

const passGate: RequestHandler = (_req, _res, next) => next()

function appWith(store: ProfilesStore, gate: RequestHandler = passGate): Express {
  const app = express()
  app.use(express.json())
  app.use('/api/profiles', profilesRouter(store, gate))
  app.use(errorHandler)
  return app
}

async function post(base: string, body: unknown) {
  return fetch(`${base}/api/profiles`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('GET /api/profiles', () => {
  it('returns the list publicly', async () => {
    const store = fakeStore({
      list: vi.fn(async () => [rowFor({ emoji: '🦊', name: 'Mr Fox', place: 'train station' })]),
    })
    await withServer(appWith(store, requireWriteAuth('natalie', 'sekrit')), async (base) => {
      const res = await fetch(`${base}/api/profiles`)
      expect(res.status).toBe(200)
      const body = (await res.json()) as Array<{ name: string }>
      expect(body[0].name).toBe('Mr Fox')
    })
  })
})

describe('POST /api/profiles', () => {
  it('201s a valid profile', async () => {
    const store = fakeStore()
    await withServer(appWith(store), async (base) => {
      const res = await post(base, { emoji: '🦊', name: 'Mr Fox', place: 'train station' })
      expect(res.status).toBe(201)
      expect(store.create).toHaveBeenCalledWith({ emoji: '🦊', name: 'Mr Fox', place: 'train station' })
    })
  })

  it('normalizes empty place to null and omits are allowed', async () => {
    const store = fakeStore()
    await withServer(appWith(store), async (base) => {
      const res = await post(base, { emoji: '🦊', name: 'Mr Fox', place: '' })
      expect(res.status).toBe(201)
      expect(store.create).toHaveBeenCalledWith({ emoji: '🦊', name: 'Mr Fox', place: null })
    })
  })

  it.each([
    ['missing name', { emoji: '🦊' }, 'name'],
    ['empty name', { emoji: '🦊', name: '' }, 'name'],
    ['name too long', { emoji: '🦊', name: 'x'.repeat(101) }, 'name'],
    ['missing emoji', { name: 'Mr Fox' }, 'emoji'],
    ['emoji too long', { emoji: 'x'.repeat(17), name: 'Mr Fox' }, 'emoji'],
    ['place too long', { emoji: '🦊', name: 'Mr Fox', place: 'x'.repeat(101) }, 'place'],
    ['unknown field', { emoji: '🦊', name: 'Mr Fox', nickname: 'Foxy' }, 'nickname'],
  ])('400s on %s', async (_label, body, field) => {
    const store = fakeStore()
    await withServer(appWith(store), async (base) => {
      const res = await post(base, body)
      expect(res.status).toBe(400)
      expect(((await res.json()) as { details: Record<string, string> }).details[field]).toBeDefined()
      expect(store.create).not.toHaveBeenCalled()
    })
  })

  it('maps a store conflict to 409', async () => {
    const store = fakeStore({ create: vi.fn(async () => ({ ok: false as const, conflict: true as const })) })
    await withServer(appWith(store), async (base) => {
      const res = await post(base, { emoji: '🦊', name: 'Mr Fox' })
      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({ error: 'conflict' })
    })
  })

  it('is auth-gated', async () => {
    await withServer(appWith(fakeStore(), requireWriteAuth('natalie', 'sekrit')), async (base) => {
      expect((await post(base, { emoji: '🦊', name: 'Mr Fox' })).status).toBe(401)
    })
  })
})

describe('DELETE /api/profiles/:id', () => {
  it('204s on success, 404 on miss, 400 on non-uuid, and is auth-gated', async () => {
    const store = fakeStore()
    await withServer(appWith(store), async (base) => {
      expect((await fetch(`${base}/api/profiles/${FIXED_ID}`, { method: 'DELETE' })).status).toBe(204)
    })
    await withServer(appWith(fakeStore({ remove: vi.fn(async () => false) })), async (base) => {
      expect((await fetch(`${base}/api/profiles/${FIXED_ID}`, { method: 'DELETE' })).status).toBe(404)
    })
    await withServer(appWith(store), async (base) => {
      expect((await fetch(`${base}/api/profiles/42`, { method: 'DELETE' })).status).toBe(400)
    })
    await withServer(appWith(store, requireWriteAuth('natalie', 'sekrit')), async (base) => {
      expect(
        (await fetch(`${base}/api/profiles/${FIXED_ID}`, {
          method: 'DELETE',
          headers: { authorization: basic('natalie', 'wrong') },
        })).status,
      ).toBe(401)
    })
  })
})
```

- [ ] **Step 2: Run to verify failure, then implement the router**

`app/server/profiles/routes.ts`:

```ts
import { Router, type RequestHandler, type Response } from 'express'
import type { NewProfile, ProfilesStore } from './store.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const KNOWN_FIELDS = new Set(['emoji', 'name', 'place'])

function sendValidation(res: Response, details: Record<string, string>) {
  res.status(400).json({ error: 'validation', details })
}

function parseNewProfile(body: unknown):
  | { ok: true; fields: NewProfile }
  | { ok: false; details: Record<string, string> } {
  const details = Object.create(null) as Record<string, string>
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

  const name = record.name
  if (typeof name !== 'string' || name.length === 0 || name.length > 100) {
    details.name = 'required, 1-100 characters'
  }

  let place: string | null = null
  const rawPlace = record.place
  if (rawPlace === undefined || rawPlace === null || rawPlace === '') {
    place = null
  } else if (typeof rawPlace !== 'string' || rawPlace.length > 100) {
    details.place = 'must be a string of at most 100 characters'
  } else {
    place = rawPlace
  }

  if (Object.keys(details).length > 0) return { ok: false, details }
  return { ok: true, fields: { emoji: emoji as string, name: name as string, place } }
}

export function profilesRouter(store: ProfilesStore, writeGate: RequestHandler): Router {
  const router = Router()

  router.get('/', async (_req, res) => {
    res.json(await store.list())
  })

  router.post('/', writeGate, async (req, res) => {
    const parsed = parseNewProfile(req.body)
    if (!parsed.ok) {
      sendValidation(res, parsed.details)
      return
    }
    const result = await store.create(parsed.fields)
    if (!result.ok) {
      res.status(409).json({ error: 'conflict' })
      return
    }
    res.status(201).json(result.row)
  })

  router.delete('/:id', writeGate, async (req, res) => {
    const { id } = req.params as { id: string }
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

- [ ] **Step 3: Wire into createApp, entrypoint, and the app test helper**

`app/server/app.ts`: import `profilesRouter` and `ProfilesStore`; `AppDeps` gains `profilesStore: ProfilesStore`; after the sightings mount add `app.use('/api/profiles', profilesRouter(deps.profilesStore, writeGate))`.

`app/server/index.ts`: `import { createProfilesStore } from './profiles/store.js'` and add `profilesStore: createProfilesStore(db)` to the `createApp` call.

`app/server/app.test.ts`: the `deps()` helper gains a fake profiles store:

```ts
function fakeProfilesStore(): ProfilesStore {
  return {
    list: vi.fn(async () => []),
    create: vi.fn(async () => { throw new Error('unused') }),
    remove: vi.fn(async () => true),
  }
}
// in deps(): profilesStore: fakeProfilesStore(),
```

(import `type { ProfilesStore } from './profiles/store.js'`).

- [ ] **Step 4: Seam integration test**

`app/server/profiles/api.integration.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import type { createDb } from '../db/index.js'
import { createSightingsStore } from '../sightings/store.js'
import { createTestDb } from '../testDb.js'
import { basic, withServer } from '../testUtils.js'
import { createProfilesStore } from './store.js'

const AUTH = basic('natalie', 'sekrit')

describe('profiles API against real postgres', () => {
  let handle: ReturnType<typeof createDb>

  beforeAll(async () => {
    handle = await createTestDb()
  })

  afterAll(async () => {
    await handle?.pool.end()
  })

  function app() {
    return createApp({
      checkDb: async () => {
        await handle.pool.query('SELECT 1')
      },
      sightingsStore: createSightingsStore(handle.db),
      profilesStore: createProfilesStore(handle.db),
      writeCredentials: { user: 'natalie', password: 'sekrit' },
    })
  }

  it('POST → GET → duplicate 409 → DELETE round-trips', async () => {
    await withServer(app(), async (base) => {
      const created = await fetch(`${base}/api/profiles`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: AUTH },
        body: JSON.stringify({ emoji: '🦊', name: 'Mr Fox', place: 'train station' }),
      })
      expect(created.status).toBe(201)
      const profile = (await created.json()) as { id: string; place: string | null }
      expect(profile.place).toBe('train station')

      const listed = (await (await fetch(`${base}/api/profiles`)).json()) as Array<{ id: string }>
      expect(listed).toHaveLength(1)

      const dup = await fetch(`${base}/api/profiles`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: AUTH },
        body: JSON.stringify({ emoji: '🦊', name: 'Mr Fox' }),
      })
      expect(dup.status).toBe(409)

      const deleted = await fetch(`${base}/api/profiles/${profile.id}`, {
        method: 'DELETE',
        headers: { authorization: AUTH },
      })
      expect(deleted.status).toBe(204)
      expect(await (await fetch(`${base}/api/profiles`)).json()).toEqual([])
    })
  })
})
```

- [ ] **Step 5: README API section**

In `README.md`'s `## API` block, append:

```
    GET    /api/profiles                                  # public; saved critter friends
    POST   /api/profiles                                  # basic auth; emoji + name required
    DELETE /api/profiles/:id                              # basic auth
```

- [ ] **Step 6: Full suite, lint, typecheck, commit**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all green.

```bash
git add app/server README.md
git commit -m "feat: profiles API with conflict handling, wired into the app"
```

---

### Task 5: Client data layer — api.ts additions + useProfiles hook (TDD)

**Files:**
- Modify: `app/src/api.ts`
- Create: `app/src/hooks/useProfiles.ts`
- Test: `app/src/api.test.ts` (append), `app/src/hooks/useProfiles.test.ts`

**Interfaces:**
- Produces (Task 6 consumes):

```ts
// api.ts
export type Profile = { id: string; emoji: string; name: string; place: string | null; createdAt: string }
export type NewProfileInput = { emoji: string; name: string; place?: string }
export async function listProfiles(): Promise<Profile[]>
export async function createProfile(fields: NewProfileInput, authHeader: string): Promise<Profile>
export async function deleteProfile(id: string, authHeader: string): Promise<void>
// useProfiles
export function useProfiles(): {
  profiles: Profile[]
  status: 'loading' | 'ready' | 'error'
  addProfile(fields: NewProfileInput, authHeader: string): Promise<void>   // 201 prepends; 409 resolves + refetches
  removeProfile(id: string, authHeader: string): Promise<void>            // 204/404 remove locally; others rethrow
  retry(): void
}
```

- [ ] **Step 1: Append failing api tests**

`app/src/api.test.ts` (uses the existing `stubFetchQueue` helper):

```ts
const PROFILE = {
  id: '3f9a26cc-1c0e-4c3a-9b52-08a1c2f4d9aa',
  emoji: '🦊',
  name: 'Mr Fox',
  place: 'train station',
  createdAt: '2026-07-04T12:00:00.000Z',
}

describe('profiles api', () => {
  it('lists, creates with auth, and deletes', async () => {
    let mock = stubFetchQueue([{ status: 200, body: [PROFILE] }])
    await expect(listProfiles()).resolves.toEqual([PROFILE])
    expect(mock).toHaveBeenCalledWith('/api/profiles')

    mock = stubFetchQueue([{ status: 201, body: PROFILE }])
    await expect(createProfile({ emoji: '🦊', name: 'Mr Fox', place: 'train station' }, 'Basic x')).resolves.toEqual(PROFILE)
    expect(mock).toHaveBeenCalledWith('/api/profiles', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Basic x' },
      body: JSON.stringify({ emoji: '🦊', name: 'Mr Fox', place: 'train station' }),
    })

    mock = stubFetchQueue([{ status: 204, body: null }])
    await expect(deleteProfile(PROFILE.id, 'Basic x')).resolves.toBeUndefined()
    expect(mock).toHaveBeenCalledWith(`/api/profiles/${PROFILE.id}`, {
      method: 'DELETE',
      headers: { authorization: 'Basic x' },
    })
  })

  it('throws ApiError with status on conflict', async () => {
    stubFetchQueue([{ status: 409, body: { error: 'conflict' } }])
    await expect(createProfile({ emoji: '🦊', name: 'Mr Fox' }, 'Basic x')).rejects.toMatchObject({ status: 409 })
  })
})
```

- [ ] **Step 2: Implement api.ts additions**

Append to `app/src/api.ts`:

```ts
export type Profile = {
  id: string
  emoji: string
  name: string
  place: string | null
  createdAt: string
}

export type NewProfileInput = { emoji: string; name: string; place?: string }

export async function listProfiles(): Promise<Profile[]> {
  const res = await fetch('/api/profiles')
  if (!res.ok) throw new ApiError(res.status)
  return (await res.json()) as Profile[]
}

export async function createProfile(fields: NewProfileInput, authHeader: string): Promise<Profile> {
  const res = await fetch('/api/profiles', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: authHeader },
    body: JSON.stringify(fields),
  })
  if (!res.ok) throw new ApiError(res.status)
  return (await res.json()) as Profile
}

export async function deleteProfile(id: string, authHeader: string): Promise<void> {
  const res = await fetch(`/api/profiles/${id}`, {
    method: 'DELETE',
    headers: { authorization: authHeader },
  })
  if (!res.ok) throw new ApiError(res.status)
}
```

- [ ] **Step 3: Write failing hook tests**

`app/src/hooks/useProfiles.test.ts`:

```ts
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { stubFetchQueue } from '../test/helpers'
import { useProfiles } from './useProfiles'

const PROFILE = {
  id: '3f9a26cc-1c0e-4c3a-9b52-08a1c2f4d9aa',
  emoji: '🦊',
  name: 'Mr Fox',
  place: 'train station',
  createdAt: '2026-07-04T12:00:00.000Z',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useProfiles', () => {
  it('loads on mount and prepends on add', async () => {
    const second = { ...PROFILE, id: '00000000-0000-4000-8000-000000000001', name: 'Professor Hoot', emoji: '🦉' }
    stubFetchQueue([
      { status: 200, body: [PROFILE] },
      { status: 201, body: second },
    ])
    const { result } = renderHook(() => useProfiles())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await act(() => result.current.addProfile({ emoji: '🦉', name: 'Professor Hoot' }, 'Basic x'))
    expect(result.current.profiles.map((p) => p.name)).toEqual(['Professor Hoot', 'Mr Fox'])
  })

  it('treats 409 as success and refetches', async () => {
    stubFetchQueue([
      { status: 200, body: [] },
      { status: 409, body: { error: 'conflict' } },
      { status: 200, body: [PROFILE] },
    ])
    const { result } = renderHook(() => useProfiles())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await act(() => result.current.addProfile({ emoji: '🦊', name: 'Mr Fox' }, 'Basic x'))
    await waitFor(() => expect(result.current.profiles).toEqual([PROFILE]))
  })

  it('removeProfile deletes locally on 204 and treats 404 as success', async () => {
    stubFetchQueue([
      { status: 200, body: [PROFILE] },
      { status: 404, body: { error: 'not found' } },
    ])
    const { result } = renderHook(() => useProfiles())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await act(() => result.current.removeProfile(PROFILE.id, 'Basic x'))
    expect(result.current.profiles).toEqual([])
  })

  it('rethrows other errors without touching state', async () => {
    stubFetchQueue([
      { status: 200, body: [PROFILE] },
      { status: 503, body: { error: 'writes disabled' } },
    ])
    const { result } = renderHook(() => useProfiles())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await expect(
      act(() => result.current.removeProfile(PROFILE.id, 'Basic x')),
    ).rejects.toMatchObject({ status: 503 })
    expect(result.current.profiles).toEqual([PROFILE])
  })
})
```

- [ ] **Step 4: Implement the hook**

`app/src/hooks/useProfiles.ts`:

```ts
import { useCallback, useEffect, useState } from 'react'
import {
  ApiError,
  createProfile,
  deleteProfile,
  listProfiles,
  type NewProfileInput,
  type Profile,
} from '../api'

export function useProfiles() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadCount, setLoadCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    listProfiles()
      .then((rows) => {
        if (cancelled) return
        setProfiles(rows)
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [loadCount])

  const retry = useCallback(() => {
    setStatus('loading')
    setLoadCount((n) => n + 1)
  }, [])

  const addProfile = useCallback(async (fields: NewProfileInput, authHeader: string) => {
    try {
      const created = await createProfile(fields, authHeader)
      setProfiles((current) => [created, ...current])
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Already saved server-side — converge on the existing row.
        setProfiles(await listProfiles())
        return
      }
      throw err
    }
  }, [])

  const removeProfile = useCallback(async (id: string, authHeader: string) => {
    try {
      await deleteProfile(id, authHeader)
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 404)) throw err
    }
    setProfiles((current) => current.filter((p) => p.id !== id))
  }, [])

  return { profiles, status, addProfile, removeProfile, retry }
}
```

- [ ] **Step 5: Run to verify pass, lint, typecheck, commit**

```bash
NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client && pnpm lint && pnpm typecheck
git add app/src/api.ts app/src/api.test.ts app/src/hooks/useProfiles.ts app/src/hooks/useProfiles.test.ts
git commit -m "feat: profiles api client and useProfiles hook with 409 convergence"
```

---

### Task 6: Friends UI — picker row, prefilled place, save/remove-friend toggle, App threading

**Files:**
- Modify: `app/src/components/EmojiPicker.tsx`, `app/src/components/DetailsForm.tsx` (initialPlace), `app/src/components/LogSightingFlow.tsx` (Picked.place + friends prop), `app/src/components/SightingDetail.tsx` (friend toggle), `app/src/App.tsx` (threading), `app/src/index.css`
- Test: `app/src/components/EmojiPicker.test.tsx` (append), `app/src/components/SightingDetail.test.tsx` (append), `app/src/App.test.tsx` (append one threading test)
- FROZEN: `app/src/components/LogSightingFlow.test.tsx`, existing DetailsForm tests (new props optional)

**Interfaces:**
- Consumes: `Profile`, `useProfiles` (Task 5), `useWriteAction`.
- Produces component contracts:

```ts
EmojiPicker props += { friends: Profile[]; onPickFriend(profile: Profile): void }
DetailsForm props += { initialPlace?: string | null }        // optional, default null
LogSightingFlow props += { friends?: Profile[]; }            // default []; Picked gains place
SightingDetail props += {
  profiles: Profile[]
  addProfile(fields: NewProfileInput, authHeader: string): Promise<void>
  removeProfile(id: string, authHeader: string): Promise<void>
}
```

- [ ] **Step 1: Append failing EmojiPicker tests**

`app/src/components/EmojiPicker.test.tsx` (existing tests pass `recent`; they must now also pass `friends={[]}` — wait, NO: to keep existing tests untouched, `friends` and `onPickFriend` are OPTIONAL with defaults `[]` / no-op). Append:

```tsx
const MR_FOX = {
  id: '3f9a26cc-1c0e-4c3a-9b52-08a1c2f4d9aa',
  emoji: '🦊',
  name: 'Mr Fox',
  place: 'train station',
  createdAt: '2026-07-04T12:00:00.000Z',
}

describe('EmojiPicker friends row', () => {
  it('hides the row when there are no friends', () => {
    render(<EmojiPicker recent={[]} onPick={() => {}} onCancel={() => {}} />)
    expect(screen.queryByText('Friends')).not.toBeInTheDocument()
  })

  it('renders friends above everything and fires onPickFriend with the profile', async () => {
    const onPickFriend = vi.fn()
    render(
      <EmojiPicker
        recent={['🐸']}
        friends={[MR_FOX]}
        onPickFriend={onPickFriend}
        onPick={() => {}}
        onCancel={() => {}}
      />,
    )
    expect(screen.getByText('Friends')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Friend Mr Fox' }))
    expect(onPickFriend).toHaveBeenCalledWith(MR_FOX)
  })
})
```

- [ ] **Step 2: Implement EmojiPicker changes**

In `app/src/components/EmojiPicker.tsx`: Props gains `friends?: Profile[]` and `onPickFriend?: (profile: Profile) => void` (import `type { Profile } from '../api'`); destructure with `friends = []` and `onPickFriend`. Insert ABOVE the "Recently seen" block:

```tsx
      {friends.length > 0 && (
        <>
          <h3 className="picker-recent-heading">Friends</h3>
          <div className="picker-grid picker-grid-recent">
            {friends.map((profile) => (
              <button
                key={profile.id}
                type="button"
                className="picker-tile friend-tile"
                aria-label={`Friend ${profile.name}`}
                onClick={() => onPickFriend?.(profile)}
              >
                <span aria-hidden="true">{profile.emoji}</span>
                <span className="friend-name">{profile.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
```

CSS append:

```css
.friend-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
}

.friend-name {
  font-size: 9px;
  font-weight: 700;
  color: var(--ink-secondary);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

- [ ] **Step 3: DetailsForm initialPlace + LogSightingFlow friends threading**

`DetailsForm.tsx`: Props gains `initialPlace?: string | null`; `const [place, setPlace] = useState(initialPlace ?? '')`. (Optional prop — frozen tests unaffected.)

`LogSightingFlow.tsx`:
- Props gains `friends?: Profile[]` (default `[]`; import `type { Profile } from '../api'`).
- `type Picked = { emoji: string; name: string | null; place: string | null }`.
- `onPick={(emoji, name) => setPicked({ emoji, name, place: null })}`.
- EmojiPicker gets `friends={friends}` and `onPickFriend={(p) => setPicked({ emoji: p.emoji, name: p.name, place: p.place })}`.
- DetailsForm gets `initialPlace={picked.place}` and its `key` becomes `picked.emoji + (picked.name ?? '') + (picked.place ?? '')`.

Run the client project — LogSightingFlow.test.tsx must pass unchanged (verify with `git status` that it is not modified).

- [ ] **Step 4: SightingDetail friend toggle (tests first)**

Append to `app/src/components/SightingDetail.test.tsx` (extend the `renderDetail` helper's default props with `profiles: []`, `addProfile: vi.fn(async () => {})`, `removeProfile: vi.fn(async () => {})` — the helper spreads overrides, existing tests keep passing):

```tsx
describe('friend toggle', () => {
  it('saves a friend from the sighting fields', async () => {
    setCredentials('sekrit')
    const addProfile = vi.fn(async () => {})
    const { sighting } = renderDetail({ addProfile })
    await userEvent.click(screen.getByRole('button', { name: '⭐ Save as friend' }))
    await vi.waitFor(() =>
      expect(addProfile).toHaveBeenCalledWith(
        { emoji: sighting.emoji, name: sighting.name, place: sighting.place ?? undefined },
        'Basic ' + btoa('natalie:sekrit'),
      ),
    )
  })

  it('shows Remove friend when a matching profile exists and removes it', async () => {
    setCredentials('sekrit')
    const removeProfile = vi.fn(async () => {})
    const sighting = makeSighting({ emoji: '🦊', name: 'Fox' })
    const profile = {
      id: '00000000-0000-4000-8000-000000000009',
      emoji: '🦊',
      name: 'Fox',
      place: null,
      createdAt: '2026-07-04T12:00:00.000Z',
    }
    renderDetail({ sighting, profiles: [profile], removeProfile })
    expect(screen.queryByRole('button', { name: '⭐ Save as friend' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Remove friend' }))
    await vi.waitFor(() => expect(removeProfile).toHaveBeenCalledWith(profile.id, expect.any(String)))
  })

  it('hides the toggle for nameless sightings', () => {
    renderDetail({ sighting: makeSighting({ name: null }) })
    expect(screen.queryByRole('button', { name: /friend/i })).not.toBeInTheDocument()
  })
})
```

Then implement in `SightingDetail.tsx`:
- Props gains `profiles: Profile[]`, `addProfile`, `removeProfile` per the Interfaces block (import `type { NewProfileInput, Profile } from '../api'`).
- A second write hook: `const friendWrite = useWriteAction({ disabled: 'Saving is disabled right now', failed: "Couldn't save — try again" })`.
- `const matching = sighting.name === null ? undefined : profiles.find((p) => p.emoji === sighting.emoji && p.name === sighting.name)`.
- Between the comment block and `write.actionError`, insert:

```tsx
      {sighting.name !== null && (
        <button
          type="button"
          className="btn-secondary friend-toggle"
          disabled={friendWrite.busy}
          onClick={() => {
            if (matching === undefined) {
              friendWrite.run(
                (authHeader) =>
                  addProfile(
                    { emoji: sighting.emoji, name: sighting.name as string, place: sighting.place ?? undefined },
                    authHeader,
                  ),
                () => {},
              )
            } else {
              friendWrite.run((authHeader) => removeProfile(matching.id, authHeader), () => {})
            }
          }}
        >
          {matching === undefined ? '⭐ Save as friend' : 'Remove friend'}
        </button>
      )}
      {friendWrite.actionError !== null && <p className="flow-error">{friendWrite.actionError}</p>}
```

- Render `friendWrite.prompt` the same way `write.prompt` is rendered (a second `prompt-overlay` block guarded by `friendWrite.prompt.open`).
- CSS: `.friend-toggle { width: 100%; margin-top: 14px; }`.

- [ ] **Step 5: App threading + one test**

`app/src/App.tsx`: `const { profiles, addProfile, removeProfile } = useProfiles()` (import the hook); pass `friends={profiles}` to `LogSightingFlow`; pass `profiles={profiles}` `addProfile={addProfile}` `removeProfile={removeProfile}` to `SightingDetail`.

Append to `app/src/App.test.tsx` (fetch queue note: App now fetches BOTH /api/sightings and /api/profiles on mount — the shared `stubFetchQueue` is order-based, and the two hooks fire in mount order (useSightings first, useProfiles second per App's hook order). Update the queue in NEW tests to provide both responses; EXISTING tests' queues will feed their single stub response to whichever fetch lands first — check each existing test still passes and, if one flakes on ordering, convert its queue stub to a URL-routing stub in `test/helpers` (add `stubFetchByUrl(routes: Record<string, {status, body}[]>)`) and use it ONLY in the tests that need both endpoints; do not weaken assertions):

```tsx
  it('threads friends into the picker', async () => {
    stubFetchByUrl({
      '/api/sightings': [{ status: 200, body: [] }],
      '/api/profiles': [
        { status: 200, body: [{ id: '00000000-0000-4000-8000-000000000009', emoji: '🦊', name: 'Mr Fox', place: 'train station', createdAt: '2026-07-04T12:00:00.000Z' }] },
      ],
    })
    render(<App />)
    await userEvent.click(screen.getAllByRole('button', { name: /log a sighting/i })[0])
    expect(await screen.findByRole('button', { name: 'Friend Mr Fox' })).toBeInTheDocument()
  })
```

`stubFetchByUrl` (add to `app/src/test/helpers.tsx`):

```tsx
export function stubFetchByUrl(routes: Record<string, Array<{ status: number; body: unknown }>>): Mock {
  const queues = new Map(Object.entries(routes).map(([url, rs]) => [url, [...rs]]))
  const mock = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : new URL(input.url, 'http://x').pathname
    const key = [...queues.keys()].find((k) => url.startsWith(k))
    const next = (key !== undefined ? queues.get(key)!.shift() : undefined) ?? { status: 500, body: { error: 'internal' } }
    return new Response(JSON.stringify(next.body), { status: next.status })
  })
  vi.stubGlobal('fetch', mock)
  return mock
}
```

IMPORTANT: audit each EXISTING App test after threading useProfiles — every mounted App now issues a second fetch. Tests stubbing a single-response queue will feed that response to the sightings fetch and the profiles fetch gets the 500 fallback, which useProfiles maps to a silent 'error' status (Friends row simply absent) — assert this doesn't break any existing expectation (it shouldn't: no existing test asserts on profiles). If any existing test DOES break, migrate just that test to `stubFetchByUrl` preserving its assertions.

- [ ] **Step 6: Full gate + commit**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client && pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: all green; `git status` shows LogSightingFlow.test.tsx untouched.

```bash
git add app/src
git commit -m "feat: friends picker row, prefilled place, save/remove friend toggle"
```

---

### Task 7: End-to-end verification (spec Definition of Done)

**Files:** none (verification; fix-forward only for transcription bugs)

- [ ] **Step 1: Stack up in the worktree**

`cp /Users/james/projects/github/jamesawesome/nataliesawacritter.info/.env .env` (do not modify the original); stop any stale container holding 8080 (report if so); `docker compose up -d --build`; health → `{"ok":true,"db":true}`. The new migration applies on boot — check `docker compose logs app | grep -i migrat` shows success.

- [ ] **Step 2: DoD flows via API**

```bash
PASS=$(grep '^WRITE_PASSWORD=' .env | cut -d= -f2)
AUTH="natalie:$PASS"
# future date rejected (server guard):
FUTURE=$(date -v+3d +%Y-%m-%d 2>/dev/null || date -d '+3 days' +%Y-%m-%d)
curl -s -X POST -u "$AUTH" -H 'content-type: application/json' \
  -d "{\"emoji\":\"🦊\",\"sightedOn\":\"$FUTURE\"}" http://localhost:8080/api/sightings
# → 400 with details.sightedOn "must not be in the future"
# profile lifecycle:
curl -s -X POST -u "$AUTH" -H 'content-type: application/json' \
  -d '{"emoji":"🦊","name":"Mr Fox","place":"train station"}' http://localhost:8080/api/profiles
curl -s -X POST -u "$AUTH" -H 'content-type: application/json' \
  -d '{"emoji":"🦊","name":"Mr Fox"}' -o /dev/null -w '%{http_code}\n' http://localhost:8080/api/profiles   # → 409
curl -s http://localhost:8080/api/profiles | head -c 300
# served bundle contains the new UI:
ASSET=$(curl -s http://localhost:8080/ | grep -o 'assets/index-[^"]*\.js' | head -1)
curl -s "http://localhost:8080/$ASSET" | grep -c 'Save as friend'
```

Expected: 400 future rejection with the exact message; 201 then 409; list shows Mr Fox; bundle grep ≥ 1.

- [ ] **Step 3: Clean up rows, leave the stack up**

Delete the test profile (and any sightings created) via authed DELETEs; verify empty lists; LEAVE the stack running for the human visual pass (time picker + Now, future date blocked in the form, save Mr Fox as friend → Friends row → two-tap log with train station prefilled).

- [ ] **Step 4: Full local gate**

From `app/`: `pnpm lint && pnpm typecheck && pnpm test:coverage && pnpm build` — all green.

---

## Final verification (spec Definition of Done)

- [ ] Browser: time picker + Now → "3:00 PM"-style display in History/Recent; future date unselectable/Save-disabled; save Mr Fox as friend from Sighting Detail → Friends row in picker → tap → Step B prefilled incl. train station → Save logs it; Remove friend works; re-save of an existing friend no-ops (409 path).
- [ ] curl: future sightedOn 400; profile 201/409/list/delete per Task 7.
- [ ] LogSightingFlow.test.tsx and existing DetailsForm tests byte-unchanged. Full suite, lint, typecheck, build green; CI green on the PR.
