# Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When Natalie logs a sighting dated today, subscribed friends get a web-push notification ("🦝 Natalie saw Mr Fox!") that opens the site when tapped — with the site becoming an installable PWA so iPhones can subscribe at all. Per `docs/superpowers/specs/2026-07-05-push-notifications-design.md`.

**Architecture:** New `server/push/` module (store + routes + notifier) mirroring `profiles/`: a `push_subscriptions` table keyed by unguessable endpoint, public subscribe/unsubscribe endpoints, and a fire-and-forget notifier the sightings POST route triggers via an injected `onCreated` callback. Client side: `public/` gains a manifest, hand-written push-only `sw.js`, and generated icons; a `NotifyBell` component in the Header runs the subscribe state machine including the iOS Add-to-Home-Screen instruction sheet.

**Tech Stack:** React 19, Express 5, Drizzle migration via `pnpm db:generate`, `web-push` (the ONE new runtime dependency, plus `@types/web-push` dev), Vitest 4 + Testcontainers.

**Spec:** `docs/superpowers/specs/2026-07-05-push-notifications-design.md`

## Global Constraints

- pnpm 11.9.0, run from `app/`; raw vitest needs `NODE_OPTIONS=--no-experimental-webstorage` (pnpm scripts already carry it); server imports use `.js` extensions; no raw hex colors in TSX (new colors become CSS vars or reuse existing ones).
- **New dependencies:** `web-push` (runtime) and `@types/web-push` (dev). Nothing else.
- **Payload shape (server → sw.js contract):** `JSON.stringify({ title, body, url })`. Title: `` `${emoji} Natalie saw ${name}!` `` when named, `` `${emoji} Natalie saw a critter!` `` when `name === null`. Body: `place` and `comment` joined with `' — '` (empty string when both null). `url` is always `'/'`.
- **Freshness rule:** notify only when `sighting.sightedOn >= utcYesterday(today())` where `today()` returns the UTC date `YYYY-MM-DD`. Older = silent backfill.
- **Disabled behavior:** VAPID env unset → all `/api/push/*` routes return 503 `{ error: 'push disabled' }`, `notifier.publicKey === null`, `notifySighting` is a no-op. Client treats a null key as unsupported and hides the bell.
- **Validation limits:** endpoint = https URL ≤ 1000 chars; `keys.p256dh` / `keys.auth` = non-empty strings ≤ 200 chars; unknown fields rejected at both levels (top-level and inside `keys`).
- **Copy exact:** bell aria-labels `Get notified` (off) / `Alerts on` (on); blocked note `Notifications are blocked for this site in your browser settings.`; failure note `Couldn't turn on notifications — try again`; iOS sheet title `Get critter alerts 🔔` with steps `Tap the Share button in Safari` / `Choose “Add to Home Screen”` / `Open the app from your home screen and tap the bell`.
- **Env vars:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` — all three required to enable push.
- FROZEN (byte-unchanged): all existing test files except `server/sightings/routes.test.ts` (gains the `onCreated` fourth argument + one new test) and any `createApp({...})` call sites, which gain the two new deps verbatim as shown in Task 4. Append-only elsewhere.

---

### Task 1: `push_subscriptions` schema, migration, and store

**Files:**
- Modify: `app/server/db/schema.ts`
- Create: `app/server/push/store.ts`, `app/drizzle/0003_push-subscriptions.sql` (generated)
- Test: `app/server/push/store.integration.test.ts`

**Interfaces:**
- Produces: `createPushStore(db)` → `PushStore` with `upsert(fields: NewSubscription): Promise<void>`, `removeByEndpoint(endpoint: string): Promise<boolean>`, `listAll(): Promise<PushSubscriptionRow[]>`. `NewSubscription = { endpoint: string; p256dh: string; auth: string }`. `PushSubscriptionRow` adds `id: string` and `createdAt: Date`.

- [ ] **Step 1: Add the table to the schema**

Append to `app/server/db/schema.ts`:

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

- [ ] **Step 2: Generate the migration**

Run (from `app/`): `pnpm db:generate --name push-subscriptions`
Expected: creates `app/drizzle/0003_push-subscriptions.sql` (a `CREATE TABLE "push_subscriptions"` with the unique endpoint constraint) plus updated `app/drizzle/meta/` journal files. Inspect the SQL; all generated files get committed.

- [ ] **Step 3: Write the failing integration test**

Create `app/server/push/store.integration.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from '../testDb.js'
import type { createDb } from '../db/index.js'
import { pushSubscriptions } from '../db/schema.js'
import { createPushStore, type PushStore } from './store.js'

const SUB = { endpoint: 'https://push.example.com/send/abc', p256dh: 'key-p256dh', auth: 'key-auth' }

describe('push store', () => {
  let handle: ReturnType<typeof createDb>
  let store: PushStore

  beforeAll(async () => {
    handle = await createTestDb()
    store = createPushStore(handle.db)
  })

  afterAll(async () => {
    await handle?.pool.end()
  })

  beforeEach(async () => {
    await handle.db.delete(pushSubscriptions)
  })

  it('upserts by endpoint: same endpoint updates keys instead of duplicating', async () => {
    await store.upsert(SUB)
    await store.upsert({ ...SUB, p256dh: 'rotated-p256dh', auth: 'rotated-auth' })
    const rows = await store.listAll()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ endpoint: SUB.endpoint, p256dh: 'rotated-p256dh', auth: 'rotated-auth' })
    expect(rows[0].id).toMatch(/^[0-9a-f]{8}-/)
  })

  it('stores distinct endpoints as distinct rows', async () => {
    await store.upsert(SUB)
    await store.upsert({ ...SUB, endpoint: 'https://push.example.com/send/def' })
    expect(await store.listAll()).toHaveLength(2)
  })

  it('removeByEndpoint returns true then false', async () => {
    await store.upsert(SUB)
    expect(await store.removeByEndpoint(SUB.endpoint)).toBe(true)
    expect(await store.removeByEndpoint(SUB.endpoint)).toBe(false)
    expect(await store.listAll()).toEqual([])
  })
})
```

- [ ] **Step 4: Run to verify failure**

Run (from `app/`): `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project integration server/push/store.integration.test.ts`
Expected: FAIL — `./store.js` module not found. (Needs Docker running.)

- [ ] **Step 5: Implement the store**

Create `app/server/push/store.ts`:

```ts
import { eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '../db/schema.js'
import { pushSubscriptions } from '../db/schema.js'

export type NewSubscription = { endpoint: string; p256dh: string; auth: string }
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect

export function createPushStore(db: NodePgDatabase<typeof schema>) {
  return {
    async upsert(fields: NewSubscription): Promise<void> {
      await db
        .insert(pushSubscriptions)
        .values(fields)
        .onConflictDoUpdate({
          target: pushSubscriptions.endpoint,
          set: { p256dh: fields.p256dh, auth: fields.auth },
        })
    },

    async removeByEndpoint(endpoint: string): Promise<boolean> {
      const removed = await db
        .delete(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, endpoint))
        .returning({ id: pushSubscriptions.id })
      return removed.length > 0
    },

    async listAll(): Promise<PushSubscriptionRow[]> {
      return db.select().from(pushSubscriptions)
    },
  }
}

export type PushStore = ReturnType<typeof createPushStore>
```

- [ ] **Step 6: Run to verify pass**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project integration server/push/store.integration.test.ts`
Expected: 3 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add server/db/schema.ts server/push/store.ts server/push/store.integration.test.ts drizzle/
git commit -m "feat: push_subscriptions table and store (upsert by endpoint)"
```

---

### Task 2: notifier — payload, freshness window, fan-out, pruning

**Files:**
- Create: `app/server/push/notifier.ts`
- Test: `app/server/push/notifier.test.ts`

**Interfaces:**
- Consumes: `PushStore` from Task 1; `Sighting` from `server/sightings/store.js`.
- Produces: `createNotifier(deps: NotifierDeps)` → `Notifier` with `publicKey: string | null` and `notifySighting(sighting: Sighting): Promise<void>` (never rejects). `NotifierDeps = { config: VapidConfig | null; store: PushStore; send: SendPush; today: () => string }`. `VapidConfig = { subject: string; publicKey: string; privateKey: string }`. `SendPush = (target: PushTarget, payload: string) => Promise<unknown>` with `PushTarget = { endpoint: string; keys: { p256dh: string; auth: string } }`. Also exports `payloadFor(sighting: Sighting): string` for direct testing.

- [ ] **Step 1: Write the failing tests**

Create `app/server/push/notifier.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Sighting } from '../sightings/store.js'
import { createNotifier, payloadFor, type SendPush } from './notifier.js'
import type { PushStore, PushSubscriptionRow } from './store.js'

const CONFIG = { subject: 'mailto:james@example.com', publicKey: 'pub-key', privateKey: 'priv-key' }
const TODAY = () => '2026-07-05'

function sighting(overrides: Partial<Sighting> = {}): Sighting {
  return {
    id: '3f9a26cc-1c0e-4c3a-9b52-08a1c2f4d9aa',
    emoji: '🦝',
    name: null,
    sightedOn: '2026-07-05',
    sightedTime: null,
    place: null,
    comment: null,
    photoPath: null,
    createdAt: new Date('2026-07-05T12:00:00Z'),
    ...overrides,
  }
}

function row(endpoint: string): PushSubscriptionRow {
  return { id: endpoint, endpoint, p256dh: 'p', auth: 'a', createdAt: new Date('2026-07-05T00:00:00Z') }
}

function fakeStore(overrides: Partial<PushStore> = {}): PushStore {
  return {
    upsert: vi.fn(async () => {}),
    removeByEndpoint: vi.fn(async () => true),
    listAll: vi.fn(async () => [row('https://push.example.com/1')]),
    ...overrides,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('payloadFor', () => {
  it('titles a named sighting with emoji and name', () => {
    const payload = JSON.parse(payloadFor(sighting({ name: 'Mr Fox', emoji: '🦊' }))) as Record<string, string>
    expect(payload.title).toBe('🦊 Natalie saw Mr Fox!')
    expect(payload.url).toBe('/')
  })

  it('falls back to "a critter" when unnamed and joins place/comment with an em dash', () => {
    const payload = JSON.parse(
      payloadFor(sighting({ place: 'the garden', comment: 'so fluffy' })),
    ) as Record<string, string>
    expect(payload.title).toBe('🦝 Natalie saw a critter!')
    expect(payload.body).toBe('the garden — so fluffy')
  })

  it('body is just the present part, or empty when both are null', () => {
    expect((JSON.parse(payloadFor(sighting({ place: 'the garden' }))) as { body: string }).body).toBe('the garden')
    expect((JSON.parse(payloadFor(sighting())) as { body: string }).body).toBe('')
  })
})

describe('notifySighting', () => {
  it('sends the payload to every subscription', async () => {
    const store = fakeStore({
      listAll: vi.fn(async () => [row('https://push.example.com/1'), row('https://push.example.com/2')]),
    })
    const send = vi.fn<SendPush>(async () => ({}))
    await createNotifier({ config: CONFIG, store, send, today: TODAY }).notifySighting(sighting())
    expect(send).toHaveBeenCalledTimes(2)
    expect(send).toHaveBeenCalledWith(
      { endpoint: 'https://push.example.com/1', keys: { p256dh: 'p', auth: 'a' } },
      payloadFor(sighting()),
    )
  })

  it('sends for yesterday but not two days ago', async () => {
    const store = fakeStore()
    const send = vi.fn<SendPush>(async () => ({}))
    const notifier = createNotifier({ config: CONFIG, store, send, today: TODAY })
    await notifier.notifySighting(sighting({ sightedOn: '2026-07-04' }))
    expect(send).toHaveBeenCalledTimes(1)
    await notifier.notifySighting(sighting({ sightedOn: '2026-07-03' }))
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('is a no-op when unconfigured', async () => {
    const store = fakeStore()
    const send = vi.fn<SendPush>(async () => ({}))
    await createNotifier({ config: null, store, send, today: TODAY }).notifySighting(sighting())
    expect(store.listAll).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  it.each([404, 410])('prunes a subscription on statusCode %i', async (statusCode) => {
    const store = fakeStore({
      listAll: vi.fn(async () => [row('https://push.example.com/dead'), row('https://push.example.com/live')]),
    })
    const send = vi.fn<SendPush>(async (target) => {
      if (target.endpoint.endsWith('/dead')) throw Object.assign(new Error('gone'), { statusCode })
      return {}
    })
    await createNotifier({ config: CONFIG, store, send, today: TODAY }).notifySighting(sighting())
    expect(store.removeByEndpoint).toHaveBeenCalledExactlyOnceWith('https://push.example.com/dead')
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('logs transient failures without pruning, and other sends still deliver', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = fakeStore({
      listAll: vi.fn(async () => [row('https://push.example.com/flaky'), row('https://push.example.com/live')]),
    })
    const send = vi.fn<SendPush>(async (target) => {
      if (target.endpoint.endsWith('/flaky')) throw Object.assign(new Error('boom'), { statusCode: 500 })
      return {}
    })
    await createNotifier({ config: CONFIG, store, send, today: TODAY }).notifySighting(sighting())
    expect(store.removeByEndpoint).not.toHaveBeenCalled()
    expect(send).toHaveBeenCalledTimes(2)
    expect(error).toHaveBeenCalled()
  })

  it('never rejects even when the store itself throws', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = fakeStore({ listAll: vi.fn(async () => { throw new Error('db down') }) })
    await expect(
      createNotifier({ config: CONFIG, store, send: vi.fn(), today: TODAY }).notifySighting(sighting()),
    ).resolves.toBeUndefined()
    expect(error).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project unit server/push/notifier.test.ts`
Expected: FAIL — `./notifier.js` module not found.

- [ ] **Step 3: Implement the notifier**

Create `app/server/push/notifier.ts`:

```ts
import type { Sighting } from '../sightings/store.js'
import type { PushStore } from './store.js'

export type VapidConfig = { subject: string; publicKey: string; privateKey: string }

/** The browser-facing subscription shape the transport sends to. */
export type PushTarget = { endpoint: string; keys: { p256dh: string; auth: string } }

/** Injected transport: web-push's sendNotification in production, a stub in tests. */
export type SendPush = (target: PushTarget, payload: string) => Promise<unknown>

export type NotifierDeps = {
  config: VapidConfig | null
  store: PushStore
  send: SendPush
  /** UTC calendar date YYYY-MM-DD; injectable for tests. */
  today: () => string
}

/** Yesterday, not today: keeps an evening sighting "today" for a logger west of UTC. */
function utcYesterday(todayIso: string): string {
  const parsed = new Date(`${todayIso}T00:00:00Z`)
  parsed.setUTCDate(parsed.getUTCDate() - 1)
  return parsed.toISOString().slice(0, 10)
}

export function payloadFor(sighting: Sighting): string {
  const title =
    sighting.name === null
      ? `${sighting.emoji} Natalie saw a critter!`
      : `${sighting.emoji} Natalie saw ${sighting.name}!`
  const body = [sighting.place, sighting.comment].filter((part) => part !== null).join(' — ')
  return JSON.stringify({ title, body, url: '/' })
}

function statusCodeOf(err: unknown): number | undefined {
  return typeof err === 'object' && err !== null && 'statusCode' in err && typeof err.statusCode === 'number'
    ? err.statusCode
    : undefined
}

export function createNotifier(deps: NotifierDeps) {
  return {
    publicKey: deps.config?.publicKey ?? null,

    /** Fire-and-forget: catches everything, never rejects. */
    async notifySighting(sighting: Sighting): Promise<void> {
      try {
        if (deps.config === null) return
        if (sighting.sightedOn < utcYesterday(deps.today())) return
        const subscriptions = await deps.store.listAll()
        const payload = payloadFor(sighting)
        await Promise.all(
          subscriptions.map(async (sub) => {
            try {
              await deps.send({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload)
            } catch (err) {
              const status = statusCodeOf(err)
              if (status === 404 || status === 410) await deps.store.removeByEndpoint(sub.endpoint)
              else console.error('push send failed:', err)
            }
          }),
        )
      } catch (err) {
        console.error('push notify failed:', err)
      }
    },
  }
}

export type Notifier = ReturnType<typeof createNotifier>
```

- [ ] **Step 4: Run to verify pass**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project unit server/push/notifier.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/push/notifier.ts server/push/notifier.test.ts
git commit -m "feat: push notifier with freshness window, fan-out, and 404/410 pruning"
```

---

### Task 3: push routes — key fetch, subscribe, unsubscribe

**Files:**
- Create: `app/server/push/routes.ts`
- Test: `app/server/push/routes.test.ts`

**Interfaces:**
- Consumes: `PushStore` (Task 1); `sendValidation`/`rejectUnknownFields` from `server/httpValidation.js`.
- Produces: `pushRouter(store: PushStore, vapidPublicKey: string | null): Router` mounted at `/api/push` — `GET /vapid-public-key` → `{ key }`, `POST /subscriptions` (body `{ endpoint, keys: { p256dh, auth } }`) → 201 `{ ok: true }`, `DELETE /subscriptions` (body `{ endpoint }`) → 204 always. Null key → every route 503 `{ error: 'push disabled' }`.

- [ ] **Step 1: Write the failing tests**

Create `app/server/push/routes.test.ts`:

```ts
import express, { type Express } from 'express'
import { describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../errorHandler.js'
import { withServer } from '../testUtils.js'
import { pushRouter } from './routes.js'
import type { PushStore } from './store.js'

const PUBLIC_KEY = 'test-public-key'
const VALID = { endpoint: 'https://push.example.com/send/abc', keys: { p256dh: 'pk', auth: 'ak' } }

function fakeStore(overrides: Partial<PushStore> = {}): PushStore {
  return {
    upsert: vi.fn(async () => {}),
    removeByEndpoint: vi.fn(async () => true),
    listAll: vi.fn(async () => []),
    ...overrides,
  }
}

function appWith(store: PushStore, key: string | null = PUBLIC_KEY): Express {
  const app = express()
  app.use(express.json())
  app.use('/api/push', pushRouter(store, key))
  app.use(errorHandler)
  return app
}

async function send(base: string, method: 'POST' | 'DELETE', body: unknown) {
  return fetch(`${base}/api/push/subscriptions`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('GET /api/push/vapid-public-key', () => {
  it('returns the key', async () => {
    await withServer(appWith(fakeStore()), async (base) => {
      const res = await fetch(`${base}/api/push/vapid-public-key`)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ key: PUBLIC_KEY })
    })
  })
})

describe('POST /api/push/subscriptions', () => {
  it('201s and upserts a valid subscription', async () => {
    const store = fakeStore()
    await withServer(appWith(store), async (base) => {
      const res = await send(base, 'POST', VALID)
      expect(res.status).toBe(201)
      expect(await res.json()).toEqual({ ok: true })
      expect(store.upsert).toHaveBeenCalledWith({ endpoint: VALID.endpoint, p256dh: 'pk', auth: 'ak' })
    })
  })

  it.each([
    ['missing endpoint', { keys: VALID.keys }, 'endpoint'],
    ['non-url endpoint', { ...VALID, endpoint: 'not a url' }, 'endpoint'],
    ['http endpoint', { ...VALID, endpoint: 'http://push.example.com/x' }, 'endpoint'],
    ['endpoint too long', { ...VALID, endpoint: 'https://push.example.com/' + 'x'.repeat(1001) }, 'endpoint'],
    ['missing keys', { endpoint: VALID.endpoint }, 'keys'],
    ['keys not an object', { ...VALID, keys: 'nope' }, 'keys'],
    ['empty p256dh', { ...VALID, keys: { p256dh: '', auth: 'ak' } }, 'keys.p256dh'],
    ['missing auth', { ...VALID, keys: { p256dh: 'pk' } }, 'keys.auth'],
    ['auth too long', { ...VALID, keys: { p256dh: 'pk', auth: 'x'.repeat(201) } }, 'keys.auth'],
    ['unknown top-level field', { ...VALID, expirationTime: null }, 'expirationTime'],
    ['unknown key field', { ...VALID, keys: { ...VALID.keys, extra: 'x' } }, 'keys.extra'],
  ])('400s on %s', async (_label, body, field) => {
    const store = fakeStore()
    await withServer(appWith(store), async (base) => {
      const res = await send(base, 'POST', body)
      expect(res.status).toBe(400)
      expect(((await res.json()) as { details: Record<string, string> }).details[field]).toBeDefined()
      expect(store.upsert).not.toHaveBeenCalled()
    })
  })
})

describe('DELETE /api/push/subscriptions', () => {
  it('204s whether or not the row existed, and 400s without an endpoint', async () => {
    const store = fakeStore()
    await withServer(appWith(store), async (base) => {
      expect((await send(base, 'DELETE', { endpoint: VALID.endpoint })).status).toBe(204)
      expect(store.removeByEndpoint).toHaveBeenCalledWith(VALID.endpoint)
    })
    await withServer(appWith(fakeStore({ removeByEndpoint: vi.fn(async () => false) })), async (base) => {
      expect((await send(base, 'DELETE', { endpoint: VALID.endpoint })).status).toBe(204)
    })
    await withServer(appWith(fakeStore()), async (base) => {
      expect((await send(base, 'DELETE', {})).status).toBe(400)
    })
  })
})

describe('when push is unconfigured', () => {
  it('503s every route with the push-disabled envelope', async () => {
    const store = fakeStore()
    await withServer(appWith(store, null), async (base) => {
      for (const res of [
        await fetch(`${base}/api/push/vapid-public-key`),
        await send(base, 'POST', VALID),
        await send(base, 'DELETE', { endpoint: VALID.endpoint }),
      ]) {
        expect(res.status).toBe(503)
        expect(await res.json()).toEqual({ error: 'push disabled' })
      }
      expect(store.upsert).not.toHaveBeenCalled()
      expect(store.removeByEndpoint).not.toHaveBeenCalled()
    })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project unit server/push/routes.test.ts`
Expected: FAIL — `./routes.js` module not found.

- [ ] **Step 3: Implement the router**

Create `app/server/push/routes.ts`:

```ts
import { Router } from 'express'
import { rejectUnknownFields, sendValidation } from '../httpValidation.js'
import type { NewSubscription, PushStore } from './store.js'

const KNOWN_FIELDS = new Set(['endpoint', 'keys'])
const KNOWN_KEY_FIELDS = new Set(['p256dh', 'auth'])

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

function parseSubscription(body: unknown):
  | { ok: true; fields: NewSubscription }
  | { ok: false; details: Record<string, string> } {
  const details = Object.create(null) as Record<string, string>
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, details: { body: 'must be a JSON object' } }
  }
  const record = body as Record<string, unknown>
  rejectUnknownFields(record, KNOWN_FIELDS, details)

  const endpoint = record.endpoint
  if (typeof endpoint !== 'string' || endpoint.length > 1000 || !isHttpsUrl(endpoint)) {
    details.endpoint = 'required, must be an https URL of at most 1000 characters'
  }

  const keyValues = { p256dh: '', auth: '' }
  const keys = record.keys
  if (typeof keys !== 'object' || keys === null || Array.isArray(keys)) {
    details.keys = 'required, must be an object with p256dh and auth'
  } else {
    const keyRecord = keys as Record<string, unknown>
    for (const key of Object.keys(keyRecord)) {
      if (!KNOWN_KEY_FIELDS.has(key)) details[`keys.${key}`] = 'unknown field'
    }
    for (const field of ['p256dh', 'auth'] as const) {
      const value = keyRecord[field]
      if (typeof value !== 'string' || value.length === 0 || value.length > 200) {
        details[`keys.${field}`] = 'required, 1-200 characters'
      } else {
        keyValues[field] = value
      }
    }
  }

  if (Object.keys(details).length > 0) return { ok: false, details }
  return { ok: true, fields: { endpoint: endpoint as string, ...keyValues } }
}

export function pushRouter(store: PushStore, vapidPublicKey: string | null): Router {
  const router = Router()

  if (vapidPublicKey === null) {
    router.use((_req, res) => {
      res.status(503).json({ error: 'push disabled' })
    })
    return router
  }

  router.get('/vapid-public-key', (_req, res) => {
    res.json({ key: vapidPublicKey })
  })

  router.post('/subscriptions', async (req, res) => {
    const parsed = parseSubscription(req.body)
    if (!parsed.ok) {
      sendValidation(res, parsed.details)
      return
    }
    await store.upsert(parsed.fields)
    res.status(201).json({ ok: true })
  })

  router.delete('/subscriptions', async (req, res) => {
    const body = req.body as unknown
    const endpoint =
      typeof body === 'object' && body !== null ? (body as Record<string, unknown>).endpoint : undefined
    if (typeof endpoint !== 'string' || endpoint.length === 0) {
      sendValidation(res, { endpoint: 'required' })
      return
    }
    await store.removeByEndpoint(endpoint)
    res.status(204).end()
  })

  return router
}
```

- [ ] **Step 4: Run to verify pass**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project unit server/push/routes.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/push/routes.ts server/push/routes.test.ts
git commit -m "feat: public push subscription endpoints and VAPID key route"
```

---

### Task 4: wiring — web-push dep, sightings onCreated hook, createApp, index.ts, delivery integration test

**Files:**
- Modify: `app/package.json` (+lockfile), `app/server/sightings/routes.ts`, `app/server/sightings/routes.test.ts`, `app/server/app.ts`, `app/server/index.ts`, every other `createApp({` call site (find with the grep in Step 4)
- Create: `app/server/push/api.integration.test.ts`

**Interfaces:**
- Consumes: `createPushStore`/`PushStore` (Task 1), `createNotifier`/`Notifier` (Task 2), `pushRouter` (Task 3).
- Produces: `sightingsRouter(store, writeGate, photosDir, onCreated: (sighting: Sighting) => void)` — 4th arg called with the created row after every successful POST. `AppDeps` gains `pushStore: PushStore` and `notifier: Notifier`.

- [ ] **Step 1: Install the dependency**

Run (from `app/`): `pnpm add web-push && pnpm add -D @types/web-push`
Expected: both appear in `package.json`; lockfile updates. If pnpm updates `pnpm-workspace.yaml` (supply-chain gates), commit that too.

- [ ] **Step 2: Write the failing route test**

In `app/server/sightings/routes.test.ts`, change `appWith` to accept and pass an `onCreated` spy (the ONLY signature change; existing tests keep passing because the parameter defaults):

```ts
function appWith(store: SightingsStore, gate: RequestHandler = passGate, onCreated: (s: Sighting) => void = () => {}): Express {
  const app = express()
  app.use(express.json())
  app.use('/api/sightings', sightingsRouter(store, gate, '/tmp/unused-photos', onCreated))
  app.use(errorHandler)
  return app
}
```

Append to the `POST /api/sightings` describe block:

```ts
  it('calls onCreated with the created row, and not on validation failure', async () => {
    const onCreated = vi.fn()
    const store = fakeStore()
    await withServer(appWith(store, passGate, onCreated), async (base) => {
      const res = await fetch(`${base}/api/sightings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(VALID),
      })
      expect(res.status).toBe(201)
      expect(onCreated).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: FIXED_ID, emoji: '🦊' }))

      const bad = await fetch(`${base}/api/sightings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ emoji: '🦊' }),
      })
      expect(bad.status).toBe(400)
      expect(onCreated).toHaveBeenCalledTimes(1)
    })
  })
```

- [ ] **Step 3: Run to verify failure, then implement the hook**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project unit server/sightings/routes.test.ts`
Expected: FAIL — `sightingsRouter` takes 3 args / `onCreated` never called.

In `app/server/sightings/routes.ts`:
- Import the row type: change the store-type import line to `import type { NewSighting, Sighting, SightingsStore } from './store.js'`.
- New signature: `export function sightingsRouter(store: SightingsStore, writeGate: RequestHandler, photosDir: string, onCreated: (sighting: Sighting) => void): Router`.
- POST handler becomes:

```ts
  router.post('/', writeGate, async (req, res) => {
    const parsed = parseNewSighting(req.body)
    if (!parsed.ok) {
      sendValidation(res, parsed.details)
      return
    }
    const created = await store.create(parsed.fields)
    onCreated(created)
    res.status(201).json(created)
  })
```

Re-run: expected PASS (including all pre-existing tests in the file).

- [ ] **Step 4: Wire createApp and update every call site**

In `app/server/app.ts`:
- Add imports: `import { pushRouter } from './push/routes.js'`, `import type { PushStore } from './push/store.js'`, `import type { Notifier } from './push/notifier.js'`.
- `AppDeps` gains:

```ts
  pushStore: PushStore
  /** publicKey null → push endpoints 503 and notifySighting no-ops. */
  notifier: Notifier
```

- Replace the sightings mount and add the push mount:

```ts
  app.use(
    '/api/sightings',
    sightingsRouter(deps.sightingsStore, writeGate, deps.photosDir, (sighting) => {
      void deps.notifier.notifySighting(sighting) // fire-and-forget; notifier never rejects
    }),
  )
  app.use('/api/sightings', sightingPhotoRouter(deps.sightingsStore, writeGate, deps.photosDir))
  app.use('/api/photos', photoFileRouter(deps.photosDir))
  app.use('/api/profiles', profilesRouter(deps.profilesStore, writeGate))
  app.use('/api/push', pushRouter(deps.pushStore, deps.notifier.publicKey))
```

Find every other `createApp({` call site: `grep -rn "createApp({" server/ --include="*.ts"`. Each one adds the same two lines to its deps object:

```ts
      pushStore: fakePushStore(),
      notifier: createNotifier({ config: null, store: fakePushStore(), send: async () => ({}), today: () => '2026-07-05' }),
```

To keep that one-liner available everywhere, append to `app/server/testUtils.ts`:

```ts
import { createNotifier, type Notifier } from './push/notifier.js'
import type { PushStore } from './push/store.js'

/** Inert push deps for suites that don't exercise push. */
export function fakePushStore(): PushStore {
  return { upsert: async () => {}, removeByEndpoint: async () => true, listAll: async () => [] }
}

export function nullNotifier(): Notifier {
  return createNotifier({ config: null, store: fakePushStore(), send: async () => ({}), today: () => '2026-07-05' })
}
```

(then call sites just add `pushStore: fakePushStore(), notifier: nullNotifier(),`).

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project unit && pnpm typecheck`
Expected: PASS — every suite compiles with the new deps.

- [ ] **Step 5: Wire index.ts**

In `app/server/index.ts`, add imports `import webpush from 'web-push'`, `import { createPushStore } from './push/store.js'`, `import { createNotifier, type SendPush } from './push/notifier.js'`, then after the `writeCredentials` block:

```ts
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY ?? ''
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY ?? ''
const vapidSubject = process.env.VAPID_SUBJECT ?? ''
const vapidConfig =
  vapidPublicKey !== '' && vapidPrivateKey !== '' && vapidSubject !== ''
    ? { subject: vapidSubject, publicKey: vapidPublicKey, privateKey: vapidPrivateKey }
    : null
console.log(vapidConfig ? 'push notifications enabled' : 'push notifications disabled (VAPID_* not set)')

const pushStore = createPushStore(db)
const sendPush: SendPush = vapidConfig
  ? (target, payload) => webpush.sendNotification(target, payload, { vapidDetails: vapidConfig })
  : async () => {
      throw new Error('push disabled')
    }
const notifier = createNotifier({
  config: vapidConfig,
  store: pushStore,
  send: sendPush,
  today: () => new Date().toISOString().slice(0, 10),
})
```

and add `pushStore, notifier,` to the `createApp({...})` deps.

- [ ] **Step 6: Write the end-to-end integration test**

Create `app/server/push/api.integration.test.ts` (real Postgres, stub transport; note `vi.waitFor` because delivery is fire-and-forget after the 201):

```ts
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app.js'
import type { createDb } from '../db/index.js'
import { createProfilesStore } from '../profiles/store.js'
import { createSightingsStore } from '../sightings/store.js'
import { createTestDb } from '../testDb.js'
import { basic, withServer } from '../testUtils.js'
import { createNotifier, type PushTarget } from './notifier.js'
import { createPushStore } from './store.js'

const AUTH = basic('natalie', 'sekrit')
const TODAY = new Date().toISOString().slice(0, 10)
const CONFIG = { subject: 'mailto:james@example.com', publicKey: 'pub', privateKey: 'priv' }

describe('push delivery through the sightings API', () => {
  let handle: ReturnType<typeof createDb>

  beforeAll(async () => {
    handle = await createTestDb()
  })

  afterAll(async () => {
    await handle?.pool.end()
  })

  it('subscribes, delivers on a fresh sighting, prunes a 410 endpoint, skips backdated', async () => {
    const pushStore = createPushStore(handle.db)
    const sent: Array<{ target: PushTarget; payload: string }> = []
    const notifier = createNotifier({
      config: CONFIG,
      store: pushStore,
      send: async (target, payload) => {
        if (target.endpoint.endsWith('/dead')) throw Object.assign(new Error('gone'), { statusCode: 410 })
        sent.push({ target, payload })
        return {}
      },
      today: () => TODAY,
    })
    const app = createApp({
      checkDb: async () => {
        await handle.pool.query('SELECT 1')
      },
      sightingsStore: createSightingsStore(handle.db),
      profilesStore: createProfilesStore(handle.db),
      writeCredentials: { user: 'natalie', password: 'sekrit' },
      photosDir: '/tmp/unused-photos',
      pushStore,
      notifier,
    })

    await withServer(app, async (base) => {
      for (const endpoint of ['https://push.example.com/live', 'https://push.example.com/dead']) {
        const res = await fetch(`${base}/api/push/subscriptions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint, keys: { p256dh: 'pk', auth: 'ak' } }),
        })
        expect(res.status).toBe(201)
      }

      const backdated = await fetch(`${base}/api/sightings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: AUTH },
        body: JSON.stringify({ emoji: '🐢', sightedOn: '2020-01-01' }),
      })
      expect(backdated.status).toBe(201)

      const fresh = await fetch(`${base}/api/sightings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: AUTH },
        body: JSON.stringify({ emoji: '🦊', sightedOn: TODAY, name: 'Mr Fox' }),
      })
      expect(fresh.status).toBe(201)

      await vi.waitFor(async () => {
        expect(sent).toHaveLength(1) // live endpoint only, fresh sighting only
        expect(await pushStore.listAll()).toHaveLength(1) // dead endpoint pruned
      })
      expect(sent[0].target.endpoint).toBe('https://push.example.com/live')
      expect(JSON.parse(sent[0].payload)).toEqual({ title: '🦊 Natalie saw Mr Fox!', body: '', url: '/' })
    })
  })
})
```

- [ ] **Step 7: Run everything**

Run: `pnpm test && pnpm lint && pnpm typecheck`
Expected: full suite PASS (integration needs Docker).

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml pnpm-workspace.yaml server/
git commit -m "feat: wire push notifier into sighting creation and app deps"
```

---

### Task 5: PWA shell — icons, manifest, service worker, registration

**Files:**
- Create: `app/scripts/make-icons.mjs`, `app/public/icons/icon-192.png`, `app/public/icons/icon-512.png`, `app/public/icons/apple-touch-icon.png` (generated), `app/public/manifest.webmanifest`, `app/public/sw.js`
- Modify: `app/index.html`, `app/src/main.tsx`

**Interfaces:**
- Consumes: the payload contract `{ title, body, url }` from Task 2.
- Produces: `/manifest.webmanifest`, `/sw.js`, `/icons/*.png` served from Vite's `public/` (copied verbatim into `dist/client` at build). `sw.js` registered from `main.tsx`.

Note: eslint's flat config only matches `**/*.{ts,tsx}`, so `sw.js` and `make-icons.mjs` are not linted — no eslint changes needed.

- [ ] **Step 1: Write the icon generator**

Create `app/scripts/make-icons.mjs` (no dependencies — draws RGBA pixels and hand-encodes the PNG; palette = `--tint-sky` background, `--ink` paw from `src/index.css`):

```js
// Generates the PWA icons: a soft sky square with an ink paw print.
// Run once from app/: node scripts/make-icons.mjs — outputs are committed.
import { writeFileSync, mkdirSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const BG = [199, 227, 250] // --tint-sky #c7e3fa
const PAW = [74, 59, 99] // --ink #4a3b63

function crc32(buf) {
  let crc = 0xffffffff
  for (const byte of buf) {
    crc ^= byte
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0 // filter: none
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// Paw in unit coordinates: one main pad + four toes.
const PARTS = [
  { cx: 0.5, cy: 0.63, rx: 0.185, ry: 0.15 },
  { cx: 0.295, cy: 0.42, rx: 0.085, ry: 0.095 },
  { cx: 0.43, cy: 0.34, rx: 0.085, ry: 0.095 },
  { cx: 0.57, cy: 0.34, rx: 0.085, ry: 0.095 },
  { cx: 0.705, cy: 0.42, rx: 0.085, ry: 0.095 },
]

/** 0..1 paw coverage at a pixel, antialiased ~1px at ellipse edges. */
function coverage(x, y, size) {
  let best = 0
  for (const { cx, cy, rx, ry } of PARTS) {
    const dx = (x / size - cx) / rx
    const dy = (y / size - cy) / ry
    const d = Math.sqrt(dx * dx + dy * dy) // 1.0 at the ellipse edge
    const edge = 1 / (rx * size) // one pixel, in ellipse units
    best = Math.max(best, Math.min(1, Math.max(0, (1 - d) / edge + 0.5)))
  }
  return best
}

function drawIcon(size) {
  const pixels = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = coverage(x + 0.5, y + 0.5, size)
      const offset = (y * size + x) * 4
      for (let c = 0; c < 3; c++) pixels[offset + c] = Math.round(BG[c] + (PAW[c] - BG[c]) * a)
      pixels[offset + 3] = 255
    }
  }
  return encodePng(size, pixels)
}

mkdirSync('public/icons', { recursive: true })
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(`public/icons/${name}`, drawIcon(size))
  console.log(`public/icons/${name} (${size}x${size})`)
}
```

- [ ] **Step 2: Generate and eyeball the icons**

Run (from `app/`): `node scripts/make-icons.mjs && file public/icons/*.png`
Expected: three files reported as `PNG image data, 192 x 192` / `512 x 512` / `180 x 180`, `8-bit/color RGBA`. View `public/icons/icon-512.png` (Read tool or open it) — a dark paw print on a soft sky square. If the paw looks off, adjust `PARTS` and regenerate; the icons are committed artifacts.

- [ ] **Step 3: Manifest, sw.js, index.html, registration**

Create `app/public/manifest.webmanifest`:

```json
{
  "name": "Natalie Saw a Critter!",
  "short_name": "Critters",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#eaf6ff",
  "theme_color": "#c7e3fa",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

Create `app/public/sw.js` (push-only worker — the payload contract is Task 2's `{ title, body, url }`):

```js
/* Push-only service worker — no fetch handler, no caches. */
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    /* malformed payload: fall through to defaults */
  }
  event.waitUntil(
    self.registration.showNotification(data.title || '🐾 Natalie saw a critter!', {
      body: data.body || '',
      data: { url: data.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const win of wins) {
        if ('focus' in win) return win.focus()
      }
      return clients.openWindow(url)
    }),
  )
})
```

In `app/index.html`, add inside `<head>` after the `<title>` line:

```html
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
    <meta name="theme-color" content="#c7e3fa" />
```

In `app/src/main.tsx`, append after the `createRoot(...)` call:

```ts
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch((err) => {
    console.error('service worker registration failed:', err)
  })
}
```

- [ ] **Step 4: Verify the build ships it all**

Run: `pnpm build && ls dist/client/sw.js dist/client/manifest.webmanifest dist/client/icons/`
Expected: build green; `sw.js`, `manifest.webmanifest`, and the three PNGs present in `dist/client`.

- [ ] **Step 5: Commit**

```bash
git add scripts/make-icons.mjs public/ index.html src/main.tsx
git commit -m "feat: PWA shell — manifest, icons, push-only service worker"
```

---

### Task 6: client push helpers and API functions

**Files:**
- Create: `app/src/lib/push.ts`
- Modify: `app/src/api.ts`
- Test: `app/src/lib/push.test.ts` (new), `app/src/api.test.ts` (append)

**Interfaces:**
- Produces (`src/lib/push.ts`): `urlBase64ToUint8Array(base64: string): Uint8Array`, `needsIosInstall(): boolean`, `pushSupported(): boolean`.
- Produces (`src/api.ts`): `fetchVapidKey(): Promise<string | null>` (null on 503 = push disabled), `savePushSubscription(subscription: PushSubscriptionInput): Promise<void>`, `deletePushSubscription(endpoint: string): Promise<void>`, `PushSubscriptionInput = { endpoint: string; keys: { p256dh: string; auth: string } }`.

- [ ] **Step 1: Write the failing lib tests**

Create `app/src/lib/push.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { needsIosInstall, pushSupported, urlBase64ToUint8Array } from './push'

const REAL_UA = navigator.userAgent

function setUserAgent(value: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value, configurable: true })
}

afterEach(() => {
  setUserAgent(REAL_UA)
  vi.unstubAllGlobals()
})

describe('urlBase64ToUint8Array', () => {
  it('decodes plain base64', () => {
    expect(Array.from(urlBase64ToUint8Array('BAUG'))).toEqual([4, 5, 6])
  })

  it('decodes base64url characters and re-pads', () => {
    // bytes [255, 254] encode as '//4=' in base64 → '__4' unpadded base64url
    expect(Array.from(urlBase64ToUint8Array('__4'))).toEqual([255, 254])
  })
})

describe('needsIosInstall', () => {
  it('is true on iPhone Safari without PushManager', () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15')
    expect(needsIosInstall()).toBe(true)
  })

  it('is false once PushManager exists (installed PWA) and on non-iOS browsers', () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15')
    vi.stubGlobal('PushManager', function PushManager() {})
    expect(needsIosInstall()).toBe(false)
    vi.unstubAllGlobals()
    setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')
    expect(needsIosInstall()).toBe(false)
  })
})

describe('pushSupported', () => {
  it('is false in a bare jsdom environment', () => {
    expect(pushSupported()).toBe(false)
  })
})
```

Append to `app/src/api.test.ts` (imports extend the existing import line: `fetchVapidKey, savePushSubscription, deletePushSubscription`):

```ts
describe('push api', () => {
  it('fetchVapidKey returns the key, and null on 503 (push disabled)', async () => {
    const mock = stubFetchQueue([{ status: 200, body: { key: 'pub-key' } }])
    await expect(fetchVapidKey()).resolves.toBe('pub-key')
    expect(mock).toHaveBeenCalledWith('/api/push/vapid-public-key')
    stubFetchQueue([{ status: 503, body: { error: 'push disabled' } }])
    await expect(fetchVapidKey()).resolves.toBeNull()
  })

  it('savePushSubscription POSTs the subscription JSON', async () => {
    const sub = { endpoint: 'https://push.example.com/x', keys: { p256dh: 'pk', auth: 'ak' } }
    const mock = stubFetchQueue([{ status: 201, body: { ok: true } }])
    await expect(savePushSubscription(sub)).resolves.toBeUndefined()
    expect(mock).toHaveBeenCalledWith('/api/push/subscriptions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(sub),
    })
    stubFetchQueue([{ status: 400, body: { error: 'validation' } }])
    await expect(savePushSubscription(sub)).rejects.toMatchObject({ status: 400 })
  })

  it('deletePushSubscription DELETEs by endpoint', async () => {
    const mock = stubFetchQueue([{ status: 204, body: null }])
    await expect(deletePushSubscription('https://push.example.com/x')).resolves.toBeUndefined()
    expect(mock).toHaveBeenCalledWith('/api/push/subscriptions', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint: 'https://push.example.com/x' }),
    })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client src/lib/push.test.ts src/api.test.ts`
Expected: FAIL — `./push` module not found; api imports undefined.

- [ ] **Step 3: Implement**

Create `app/src/lib/push.ts`:

```ts
/** Decode a base64url VAPID key into the bytes PushManager.subscribe expects. */
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (char) => char.charCodeAt(0))
}

/** iPhone/iPad Safari outside an installed PWA: push only exists after Add to Home Screen. */
export function needsIosInstall(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) && !('PushManager' in window)
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}
```

Append to `app/src/api.ts`:

```ts
export type PushSubscriptionInput = { endpoint: string; keys: { p256dh: string; auth: string } }

/** Returns null when push is disabled server-side (503). */
export async function fetchVapidKey(): Promise<string | null> {
  const res = await fetch('/api/push/vapid-public-key')
  if (res.status === 503) return null
  if (!res.ok) throw new ApiError(res.status)
  return ((await res.json()) as { key: string }).key
}

export async function savePushSubscription(subscription: PushSubscriptionInput): Promise<void> {
  const res = await fetch('/api/push/subscriptions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(subscription),
  })
  if (!res.ok) throw new ApiError(res.status)
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  const res = await fetch('/api/push/subscriptions', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  })
  if (!res.ok) throw new ApiError(res.status)
}
```

- [ ] **Step 4: Run to verify pass**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client src/lib/push.test.ts src/api.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/push.ts src/lib/push.test.ts src/api.ts src/api.test.ts
git commit -m "feat: client push helpers and subscription api functions"
```

---

### Task 7: NotifyBell component, Header, styles

**Files:**
- Create: `app/src/components/NotifyBell.tsx`
- Modify: `app/src/components/Header.tsx`, `app/src/index.css`
- Test: `app/src/components/NotifyBell.test.tsx`

**Interfaces:**
- Consumes: `fetchVapidKey`/`savePushSubscription`/`deletePushSubscription` (Task 6 api.ts), `needsIosInstall`/`pushSupported`/`urlBase64ToUint8Array` (Task 6 lib), `Sheet` component.
- Produces: `<NotifyBell />` — self-contained, no props, rendered by `Header`. Renders `null` when push is unsupported (which is why existing App tests in bare jsdom stay green: no serviceWorker → null, no fetches).

- [ ] **Step 1: Write the failing component tests**

Create `app/src/components/NotifyBell.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { stubFetchQueue } from '../test/helpers'
import { NotifyBell } from './NotifyBell'

const REAL_UA = navigator.userAgent

type FakeSubscription = {
  endpoint: string
  toJSON: () => { endpoint: string; keys: { p256dh: string; auth: string } }
  unsubscribe: ReturnType<typeof vi.fn>
}

function fakeSubscription(endpoint = 'https://push.example.com/browser-sub'): FakeSubscription {
  return {
    endpoint,
    toJSON: () => ({ endpoint, keys: { p256dh: 'pk', auth: 'ak' } }),
    unsubscribe: vi.fn(async () => true),
  }
}

function mockPushEnv(opts: { permission?: NotificationPermission; existing?: FakeSubscription | null } = {}) {
  const subscription = fakeSubscription()
  const registration = {
    pushManager: {
      getSubscription: vi.fn(async () => opts.existing ?? null),
      subscribe: vi.fn(async () => subscription),
    },
  }
  Object.defineProperty(window.navigator, 'serviceWorker', {
    value: { ready: Promise.resolve(registration) },
    configurable: true,
  })
  vi.stubGlobal('PushManager', function PushManager() {})
  vi.stubGlobal('Notification', {
    permission: opts.permission ?? 'default',
    requestPermission: vi.fn(async () => 'granted' as NotificationPermission),
  })
  return { registration, subscription }
}

function setUserAgent(value: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value, configurable: true })
}

afterEach(() => {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(window.navigator, 'serviceWorker')
  setUserAgent(REAL_UA)
})

describe('NotifyBell', () => {
  it('renders nothing when push is unsupported', () => {
    render(<NotifyBell />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('subscribes on tap: permission → browser subscribe → POST → Alerts on', async () => {
    const { registration } = mockPushEnv()
    const mock = stubFetchQueue([
      { status: 200, body: { key: 'BAUG' } },
      { status: 201, body: { ok: true } },
    ])
    render(<NotifyBell />)
    await userEvent.click(await screen.findByRole('button', { name: 'Get notified' }))
    await screen.findByRole('button', { name: 'Alerts on' })
    expect(registration.pushManager.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true }),
    )
    expect(mock).toHaveBeenLastCalledWith(
      '/api/push/subscriptions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          endpoint: 'https://push.example.com/browser-sub',
          keys: { p256dh: 'pk', auth: 'ak' },
        }),
      }),
    )
  })

  it('rolls back the browser subscription when the server POST fails', async () => {
    const { subscription } = mockPushEnv()
    stubFetchQueue([
      { status: 200, body: { key: 'BAUG' } },
      { status: 500, body: { error: 'internal' } },
    ])
    render(<NotifyBell />)
    await userEvent.click(await screen.findByRole('button', { name: 'Get notified' }))
    await screen.findByText("Couldn't turn on notifications — try again")
    expect(subscription.unsubscribe).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Get notified' })).toBeInTheDocument()
  })

  it('starts as Alerts on with an existing subscription, and unsubscribes on tap', async () => {
    const existing = fakeSubscription()
    mockPushEnv({ existing })
    const mock = stubFetchQueue([{ status: 204, body: null }])
    render(<NotifyBell />)
    await userEvent.click(await screen.findByRole('button', { name: 'Alerts on' }))
    await screen.findByRole('button', { name: 'Get notified' })
    expect(existing.unsubscribe).toHaveBeenCalled()
    expect(mock).toHaveBeenCalledWith('/api/push/subscriptions', expect.objectContaining({ method: 'DELETE' }))
  })

  it('shows the blocked note when permission is denied', async () => {
    mockPushEnv({ permission: 'denied' })
    render(<NotifyBell />)
    await userEvent.click(await screen.findByRole('button', { name: 'Get notified' }))
    expect(
      screen.getByText('Notifications are blocked for this site in your browser settings.'),
    ).toBeInTheDocument()
  })

  it('opens the Add to Home Screen sheet on iPhone Safari without push', async () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15')
    render(<NotifyBell />)
    await userEvent.click(await screen.findByRole('button', { name: 'Get notified' }))
    expect(screen.getByText('Get critter alerts 🔔')).toBeInTheDocument()
    expect(screen.getByText('Choose “Add to Home Screen”')).toBeInTheDocument()
  })

  it('hides itself when the server reports push disabled', async () => {
    mockPushEnv()
    stubFetchQueue([{ status: 503, body: { error: 'push disabled' } }])
    render(<NotifyBell />)
    await userEvent.click(await screen.findByRole('button', { name: 'Get notified' }))
    await waitFor(() => expect(screen.queryByRole('button')).toBeNull())
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client src/components/NotifyBell.test.tsx`
Expected: FAIL — `./NotifyBell` module not found.

- [ ] **Step 3: Implement the component**

Create `app/src/components/NotifyBell.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { deletePushSubscription, fetchVapidKey, savePushSubscription } from '../api'
import { needsIosInstall, pushSupported, urlBase64ToUint8Array } from '../lib/push'
import { Sheet } from './Sheet'

type BellState = 'unsupported' | 'ios-install' | 'blocked' | 'off' | 'on'

export function NotifyBell() {
  const [state, setState] = useState<BellState>('unsupported')
  const [note, setNote] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (needsIosInstall()) {
      setState('ios-install')
      return
    }
    if (!pushSupported()) return
    if (Notification.permission === 'denied') {
      setState('blocked')
      return
    }
    let cancelled = false
    void navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (!cancelled) setState(subscription ? 'on' : 'off')
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  async function subscribe() {
    setBusy(true)
    setNote(null)
    try {
      const key = await fetchVapidKey()
      if (key === null) {
        setState('unsupported') // push disabled server-side: hide the bell
        return
      }
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        if (permission === 'denied') setState('blocked')
        return
      }
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      })
      const json = subscription.toJSON()
      try {
        await savePushSubscription({
          endpoint: json.endpoint as string,
          keys: { p256dh: json.keys?.p256dh as string, auth: json.keys?.auth as string },
        })
      } catch (err) {
        await subscription.unsubscribe() // never show "on" for a sub the server doesn't have
        throw err
      }
      setState('on')
    } catch {
      setNote("Couldn't turn on notifications — try again")
    } finally {
      setBusy(false)
    }
  }

  async function unsubscribe() {
    setBusy(true)
    setNote(null)
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription !== null) {
        await subscription.unsubscribe() // local wins: bell off means no more buzzes
        deletePushSubscription(subscription.endpoint).catch(() => {}) // server prunes on 410 anyway
      }
      setState('off')
    } finally {
      setBusy(false)
    }
  }

  function onTap() {
    if (state === 'ios-install') setSheetOpen(true)
    else if (state === 'blocked') setNote('Notifications are blocked for this site in your browser settings.')
    else if (state === 'off') void subscribe()
    else if (state === 'on') void unsubscribe()
  }

  if (state === 'unsupported') return null
  return (
    <div className="notify-bell-wrap">
      <button
        type="button"
        className={state === 'on' ? 'notify-bell notify-bell-on' : 'notify-bell'}
        aria-pressed={state === 'on'}
        aria-label={state === 'on' ? 'Alerts on' : 'Get notified'}
        title={state === 'on' ? 'Alerts on' : 'Get notified'}
        disabled={busy}
        onClick={onTap}
      >
        🔔
      </button>
      {note !== null && <p className="notify-note">{note}</p>}
      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)}>
        <h2 className="notify-sheet-title">Get critter alerts 🔔</h2>
        <ol className="notify-steps">
          <li>Tap the Share button in Safari</li>
          <li>Choose “Add to Home Screen”</li>
          <li>Open the app from your home screen and tap the bell</li>
        </ol>
      </Sheet>
    </div>
  )
}
```

Replace `app/src/components/Header.tsx`:

```tsx
import { NotifyBell } from './NotifyBell'

export function Header() {
  return (
    <header className="app-header">
      <h1>🐾 Natalie Saw a Critter!</h1>
      <NotifyBell />
    </header>
  )
}
```

Append to `app/src/index.css` (after the `.app-header h1` block) and add `position: relative;` to the existing `.app-header` rule:

```css
.notify-bell-wrap {
  position: absolute;
  top: 12px;
  right: 12px;
  text-align: right;
}

.notify-bell {
  border: 1px solid var(--border-hairline);
  background: #fff;
  border-radius: 999px;
  padding: 5px 9px;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  box-shadow: var(--shadow-card);
}

.notify-bell-on {
  background: var(--tint-mint);
}

.notify-bell:disabled {
  opacity: 0.6;
}

.notify-note {
  margin: 6px 0 0;
  padding: 6px 8px;
  max-width: 210px;
  font-size: 11px;
  color: var(--ink);
  background: #fff;
  border: 1px solid var(--border-hairline);
  border-radius: 10px;
  box-shadow: var(--shadow-card);
}

.notify-sheet-title {
  margin: 4px 0 10px;
  font-family: 'Fredoka', sans-serif;
  font-weight: 600;
  font-size: 18px;
}

.notify-steps {
  margin: 0 0 8px;
  padding-left: 22px;
  font-size: 14px;
  line-height: 1.9;
}
```

- [ ] **Step 4: Run the client suite**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client`
Expected: NotifyBell tests PASS and every existing client test (App.test.tsx renders Header → NotifyBell returns null in bare jsdom) stays green.

- [ ] **Step 5: Commit**

```bash
git add src/components/NotifyBell.tsx src/components/NotifyBell.test.tsx src/components/Header.tsx src/index.css
git commit -m "feat: notify bell with subscribe flow, blocked note, and iOS install sheet"
```

---

### Task 8: config, docs, and full verification

**Files:**
- Modify: `.env.example`, `docker-compose.yml`, `README.md` (repo root, not `app/`)

**Interfaces:**
- Consumes: env var names from Task 4 (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`).

- [ ] **Step 1: Document the env vars**

In `.env.example`, insert before the `# --- Local dev` section:

```
# --- Push notifications (optional) ---
# Generate the key pair once: npx web-push generate-vapid-keys
# Rotating keys invalidates every existing subscription — treat like the DB password.
# All three must be set, or push stays disabled (bell hidden, /api/push/* return 503).
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
# Contact for push services, e.g. mailto:you@example.com
VAPID_SUBJECT=
```

In `docker-compose.yml`, add to the `app` service `environment` block:

```yaml
      VAPID_PUBLIC_KEY: ${VAPID_PUBLIC_KEY:-}
      VAPID_PRIVATE_KEY: ${VAPID_PRIVATE_KEY:-}
      VAPID_SUBJECT: ${VAPID_SUBJECT:-}
```

- [ ] **Step 2: Update the README**

In `README.md`: append to the API list:

```
    GET    /api/push/vapid-public-key                     # public; 503 when push disabled
    POST   /api/push/subscriptions                        # public; browser push subscription JSON
    DELETE /api/push/subscriptions                        # public; body {endpoint}
```

and add a section after "Running it":

```markdown
## Push notifications

Friends can tap the 🔔 in the header to get a push notification whenever Natalie
logs a sighting dated today (backdated entries stay silent). To enable: run
`npx web-push generate-vapid-keys` once and set `VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` in `.env` (rotating the keys
invalidates all subscriptions). With them unset the bell hides and the push
endpoints return 503.

On iPhone, web push requires the app to be installed first: Share →
Add to Home Screen, then tap the bell inside the installed app. The bell walks
friends through this.
```

- [ ] **Step 3: Full verification**

Run (from `app/`): `pnpm test && pnpm lint && pnpm typecheck && pnpm build`
Expected: everything green.

Manual smoke test (requires Docker + a Chromium browser; web push works on plain `http://localhost`):
1. `npx web-push generate-vapid-keys`, put all three VAPID vars in `.env` (any `mailto:` for subject).
2. `docker compose up -d --build`, open http://localhost:8080 in Chrome.
3. Tap 🔔 → allow notifications → bell turns green. Check `push_subscriptions` has one row.
4. Log a sighting dated today (with write credentials) → a notification appears; clicking it focuses the tab.
5. Backdate a sighting to last week → no notification.
6. Tap 🔔 again (unsubscribe) → log another sighting → no notification.

- [ ] **Step 4: Commit**

```bash
git add .env.example docker-compose.yml README.md
git commit -m "docs: VAPID configuration and push notifications setup"
```
