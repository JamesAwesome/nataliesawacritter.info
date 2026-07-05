# Photo Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Photos on sightings — client-side downscale, per-sighting raw-JPEG endpoints, add at log time (best-effort) plus add/replace/remove from Sighting Detail — preceded by the five-item debt opener, per `docs/superpowers/specs/2026-07-05-photo-upload-design.md`.

**Architecture:** Opener first: `useWriteAction` gains per-run messages so SightingDetail and LogSightingFlow collapse to ONE write instance each (single prompt/busy by construction); server validation helpers extract to `httpValidation.ts`; a custom 0002 migration normalizes the friend unique index. Then the feature: `lib/photo.ts` re-encodes on-device; `photoRoutes.ts` adds PUT/DELETE `/api/sightings/:id/photo` (raw body, no new deps) and public GET `/api/photos/:filename`; the log flow uploads best-effort after save; Detail gets the img block with add/replace/two-tap-remove.

**Tech Stack:** React 19, Express 5 (`express.raw`), Drizzle custom SQL migration, node:fs/promises, Vitest 4 + Testcontainers. **No new dependencies.**

**Spec:** `docs/superpowers/specs/2026-07-05-photo-upload-design.md`

## Global Constraints

- pnpm 11.9.0 from `app/`; raw vitest needs `NODE_OPTIONS=--no-experimental-webstorage` (pnpm scripts carry it); server imports use `.js` extensions; no raw hexes in TSX (new photo colors become CSS vars).
- **photoPath representation:** the DB column stores the full API path `/api/photos/<sightingId>-<epochMillis>.jpg`; the client uses it directly as `<img src>`; server file ops derive the on-disk name via `path.basename()`. Filenames match `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-\d+\.jpg$/i`.
- Copy exact: PhotoControl "📷 Add a photo" / "Preparing…" / "✓ Photo added" / decode error "Couldn't read that photo"; Detail actions "Replace photo" / "Remove photo" → "Really remove?"; photo write messages `{ disabled: 'Photos are disabled right now', failed: "Couldn't update the photo — try again" }`; 413 envelope `{"error":"payload too large"}`.
- Downscale: long edge ≤1600, JPEG quality 0.85, ALWAYS re-encode. Raw-body cap `'6mb'`, content-type `image/jpeg` only.
- Test-ids (Task 4): App banner `app-error`, flow error `flow-error`, Detail error `detail-error`. Fixture `makeProfile(overrides)` in `test/helpers.tsx`.
- FROZEN (byte-unchanged): `app/src/components/LogSightingFlow.test.tsx`, `app/src/components/DetailsForm.test.tsx`'s existing tests (append only). `SightingDetail.test.tsx` MAY be edited where Task 1's single-instance change makes a test's premise obsolete — replace, never delete coverage.
- PHOTOS_DIR env, default `/data/photos` (container path; Dockerfile already creates it). Tests inject `fs.mkdtemp` dirs.

---

### Task 1: useWriteAction per-run messages; collapse to single instances

**Files:**
- Modify: `app/src/hooks/useWriteAction.ts`, `app/src/components/SightingDetail.tsx`, `app/src/components/LogSightingFlow.tsx`
- Test: `app/src/hooks/useWriteAction.test.ts` (append), `app/src/components/SightingDetail.test.tsx` (one replacement, see Step 3)

**Interfaces:**
- Produces: `run(action, onSuccess, messages?: Partial<WriteMessages>)` — per-run overrides merged over the hook's defaults; error mapping uses the RUN's messages. SightingDetail and LogSightingFlow each own exactly ONE `useWriteAction` instance (Task 10 adds photo runs to the same instance).

- [ ] **Step 1: Append the failing hook test**

In `app/src/hooks/useWriteAction.test.ts` (uses existing harness helpers in that file — mirror the file's existing 503 test setup):

```ts
  it('uses per-run message overrides for error mapping', async () => {
    setCredentials('sekrit')
    const { result } = renderHook(() =>
      useWriteAction({ disabled: 'default disabled', failed: 'default failed' }),
    )
    await act(() =>
      result.current.run(
        async () => {
          throw new ApiError(503)
        },
        () => {},
        { disabled: 'photos disabled' },
      ),
    )
    await waitFor(() => expect(result.current.actionError).toBe('photos disabled'))

    await act(() =>
      result.current.run(
        async () => {
          throw new Error('boom')
        },
        () => {},
      ),
    )
    await waitFor(() => expect(result.current.actionError).toBe('default failed'))
  })
```

- [ ] **Step 2: Run to verify failure, then implement**

Run (from `app/`): `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client`
Expected: new test FAILS (run ignores the third argument).

In `app/src/hooks/useWriteAction.ts`:
- `type Pending = { action: (authHeader: string) => Promise<void>; onSuccess: () => void; messages: WriteMessages }`
- Rename the hook param to `defaults: WriteMessages`.
- In `attempt`'s catch, use `request.messages.disabled` / `request.messages.failed`.
- `run` becomes:

```ts
    run(
      action: (authHeader: string) => Promise<void>,
      onSuccess: () => void,
      messages?: Partial<WriteMessages>,
    ) {
      void attempt({ action, onSuccess, messages: { ...defaults, ...messages } })
    },
```

(Pending carries its messages, so a prompted retry after 401 keeps the run's copy.)

- [ ] **Step 3: Collapse SightingDetail to one instance**

In `app/src/components/SightingDetail.tsx`:
- Delete the `friendWrite` instance. Keep `write` (defaults stay delete-flavored).
- Friend runs pass overrides:

```tsx
              write.run(
                (authHeader) =>
                  addProfile(
                    { emoji: sighting.emoji, name: sighting.name as string, place: sighting.place ?? undefined },
                    authHeader,
                  ),
                () => {},
                { disabled: 'Saving is disabled right now', failed: "Couldn't save — try again" },
              )
```
  (and the removeProfile run identically, same override object).
- Friend toggle `disabled={write.busy}`; Delete button `disabled={write.busy}`.
- Single error line (`write.actionError`), single prompt overlay — delete the friendWrite blocks.

In `app/src/components/SightingDetail.test.tsx`, the test `'cannot open both password prompts at once'` asserts a cross-disable that no longer exists (one instance = one prompt by construction). REPLACE it with the invariant that survives:

```tsx
  it('only ever renders a single password prompt', async () => {
    renderDetail()
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await userEvent.click(screen.getByRole('button', { name: 'Really delete?' }))
    expect(screen.getAllByLabelText(/password/i)).toHaveLength(1)
  })
```

All other SightingDetail tests must pass unchanged (visible behavior is identical).

- [ ] **Step 4: Collapse LogSightingFlow to one instance**

In `app/src/components/LogSightingFlow.tsx`: delete `removeWrite`; `removeFriend()` becomes

```ts
  function removeFriend() {
    if (pickedFriend === null || onRemoveFriend === undefined) return
    const { id } = pickedFriend
    write.run((authHeader) => onRemoveFriend(id, authHeader), () => {}, {
      disabled: 'Removing is disabled right now',
      failed: "Couldn't remove — try again",
    })
  }
```

DetailsForm gets `saving={write.busy}` and `removing={write.busy}`; single error line; single prompt overlay (delete the removeWrite JSX).

- [ ] **Step 5: Full client run, lint, typecheck, frozen check, commit**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client && pnpm lint && pnpm typecheck`
Expected: all green; `git status` shows `LogSightingFlow.test.tsx` and `DetailsForm.test.tsx` untouched.

```bash
git add app/src/hooks/useWriteAction.ts app/src/hooks/useWriteAction.test.ts app/src/components/SightingDetail.tsx app/src/components/LogSightingFlow.tsx app/src/components/SightingDetail.test.tsx
git commit -m "refactor: per-run write-action messages; one write instance per component"
```

---

### Task 2: Extract server httpValidation helpers

**Files:**
- Create: `app/server/httpValidation.ts`
- Modify: `app/server/sightings/routes.ts`, `app/server/profiles/routes.ts`
- Test: `app/server/httpValidation.test.ts`

**Interfaces:**
- Produces (Tasks 6–7 consume):

```ts
export const UUID_RE: RegExp   // /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function sendValidation(res: Response, details: Record<string, string>): void  // 400 {error:'validation',details}
export function rejectUnknownFields(record: Record<string, unknown>, known: ReadonlySet<string>, details: Record<string, string>): void
```

- [ ] **Step 1: Write the failing unit test**

`app/server/httpValidation.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { UUID_RE, rejectUnknownFields } from './httpValidation.js'

describe('httpValidation', () => {
  it('UUID_RE accepts canonical uuids and rejects near-misses', () => {
    expect(UUID_RE.test('3f9a26cc-1c0e-4c3a-9b52-08a1c2f4d9aa')).toBe(true)
    expect(UUID_RE.test('3F9A26CC-1C0E-4C3A-9B52-08A1C2F4D9AA')).toBe(true)
    expect(UUID_RE.test('42')).toBe(false)
    expect(UUID_RE.test('3f9a26cc-1c0e-4c3a-9b52-08a1c2f4d9aa/../x')).toBe(false)
  })

  it('rejectUnknownFields marks every unknown key', () => {
    const details = Object.create(null) as Record<string, string>
    rejectUnknownFields({ emoji: '🦊', nickname: 'Foxy' }, new Set(['emoji']), details)
    expect(details).toEqual({ nickname: 'unknown field' })
  })
})
```

- [ ] **Step 2: Verify failure, implement, refactor consumers**

Run: `pnpm vitest run --project unit` → FAIL (module missing).

`app/server/httpValidation.ts`:

```ts
import type { Response } from 'express'

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function sendValidation(res: Response, details: Record<string, string>): void {
  res.status(400).json({ error: 'validation', details })
}

export function rejectUnknownFields(
  record: Record<string, unknown>,
  known: ReadonlySet<string>,
  details: Record<string, string>,
): void {
  for (const key of Object.keys(record)) {
    if (!known.has(key)) details[key] = 'unknown field'
  }
}
```

In `sightings/routes.ts` and `profiles/routes.ts`: delete the local `UUID_RE`, `sendValidation`, and the unknown-field for-loop; import from `../httpValidation.js` (profiles: `./..` relative — `../httpValidation.js`) and call `rejectUnknownFields(record, KNOWN_FIELDS, details)`. No behavior change.

- [ ] **Step 3: Full server projects, lint, typecheck, commit**

Run: `pnpm vitest run --project unit && pnpm vitest run --project integration && pnpm lint && pnpm typecheck`
Expected: green (pure refactor — existing route tests prove equivalence).

```bash
git add app/server/httpValidation.ts app/server/httpValidation.test.ts app/server/sightings/routes.ts app/server/profiles/routes.ts
git commit -m "refactor: shared httpValidation helpers for routers"
```

---

### Task 3: 0002 migration — case/whitespace-insensitive friend unique index

**Files:**
- Create: custom migration in `app/drizzle/` (via `pnpm db:generate --custom --name normalize-friend-name-index`)
- Modify: `app/server/db/schema.ts` (remove the old uniqueIndex declaration — the expression index lives in SQL only)
- Test: `app/server/profiles/store.integration.test.ts` (append)

**Interfaces:**
- Produces: DB rejects INSERTs where `(emoji, lower(trim(name)))` collides; the store's existing 23505 → conflict mapping is unchanged and now fires for case/whitespace variants too.

- [ ] **Step 1: Append the failing integration test**

In `app/server/profiles/store.integration.test.ts`, inside the existing describe:

```ts
  it('signals conflict for case/whitespace variants of an existing friend', async () => {
    await store.create({ emoji: '🦊', name: 'Mr Fox', place: null })
    expect(await store.create({ emoji: '🦊', name: 'mr fox', place: null })).toEqual({
      ok: false,
      conflict: true,
    })
    expect(await store.create({ emoji: '🦊', name: '  MR FOX  ', place: null })).toEqual({
      ok: false,
      conflict: true,
    })
    expect(await store.list()).toHaveLength(1)
  })
```

Run: `pnpm vitest run --project integration` → the new test FAILS (variants insert fine today).

- [ ] **Step 2: Generate the custom migration**

Run: `pnpm db:generate --custom --name normalize-friend-name-index`
Expected: empty `app/drizzle/0002_normalize-friend-name-index.sql` + journal/meta entries. Fill the SQL file with exactly:

```sql
DROP INDEX "critter_profiles_emoji_name_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "critter_profiles_emoji_norm_name_idx" ON "critter_profiles" ("emoji", lower(trim("name")));
```

In `app/server/db/schema.ts`, remove the `uniqueIndex('critter_profiles_emoji_name_idx')...` entry (and the third argument entirely if now empty, plus the unused `uniqueIndex` import) — drizzle-kit cannot express the expression index; it lives in SQL only. Do NOT regenerate 0001.

- [ ] **Step 3: Verify pass, full integration, lint, typecheck, commit**

Run: `pnpm vitest run --project integration && pnpm lint && pnpm typecheck`
Expected: green — `createTestDb` applies all migrations including 0002; the new test's variants now 23505 → conflict.

```bash
git add app/drizzle app/server/db/schema.ts app/server/profiles/store.integration.test.ts
git commit -m "feat: friend uniqueness ignores case and whitespace (0002 expression index)"
```

---

### Task 4: makeProfile fixture + error test-ids

**Files:**
- Modify: `app/src/test/helpers.tsx`, `app/src/components/EmojiPicker.test.tsx`, `app/src/components/LogSightingFlow.friends.test.tsx`, `app/src/App.tsx`, `app/src/components/LogSightingFlow.tsx`, `app/src/components/SightingDetail.tsx`, `app/src/App.test.tsx` (only if it inlines a profile literal — check)

**Interfaces:**
- Produces: `makeProfile(overrides?: Partial<Profile>): Profile` in `test/helpers.tsx`; `data-testid` attributes `app-error` (App banner), `flow-error` (LogSightingFlow error line), `detail-error` (SightingDetail error line).

- [ ] **Step 1: Add the fixture**

Append to `app/src/test/helpers.tsx`:

```tsx
let profileSeq = 0

export function makeProfile(overrides: Partial<Profile> = {}): Profile {
  profileSeq += 1
  return {
    id: `00000000-0000-4000-8000-${String(profileSeq).padStart(12, '0')}`,
    emoji: '🦊',
    name: 'Mr Fox',
    place: 'train station',
    createdAt: '2026-07-04T12:00:00.000Z',
    ...overrides,
  }
}
```

(import `type { Profile } from '../api'` at the top if not present).

- [ ] **Step 2: Migrate literals and add test-ids**

- `EmojiPicker.test.tsx` and `LogSightingFlow.friends.test.tsx`: replace the hand-rolled `MR_FOX` object literals with `const MR_FOX = makeProfile()` (keep the constant name; assertions that reference `MR_FOX.id`/fields keep working). If a test pinned the literal id in an expectation string, use `MR_FOX.id` there instead.
- `App.test.tsx`: replace any inline profile literal in `stubFetchByUrl` bodies with `makeProfile()`.
- Add `data-testid="app-error"` to App's fetch-error banner `<p>`, `data-testid="flow-error"` to LogSightingFlow's error `<p>`, `data-testid="detail-error"` to SightingDetail's error `<p>`. Class names unchanged.

- [ ] **Step 3: Full client run, lint, typecheck, frozen check, commit**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client && pnpm lint && pnpm typecheck`
Expected: green; `git status` shows `LogSightingFlow.test.tsx`, `DetailsForm.test.tsx` untouched.

```bash
git add app/src
git commit -m "test: makeProfile fixture; error-line test-ids"
```

---

### Task 5: Client image pipeline — lib/photo.ts

**Files:**
- Create: `app/src/lib/photo.ts`
- Test: `app/src/lib/photo.test.ts`

**Interfaces:**
- Produces (Task 9/10 consume):

```ts
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number }
export async function downscalePhoto(file: Blob): Promise<Blob>  // throws if the browser can't decode
```

- [ ] **Step 1: Write the failing fitWithin tests**

`app/src/lib/photo.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { fitWithin } from './photo'

describe('fitWithin', () => {
  it('scales the long edge down to maxEdge proportionally', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 })
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 })
    expect(fitWithin(2000, 2000, 1600)).toEqual({ width: 1600, height: 1600 })
  })

  it('never upscales', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 })
  })

  it('rounds to integers with a 1px floor', () => {
    expect(fitWithin(3001, 100, 1600)).toEqual({ width: 1600, height: 53 })
    expect(fitWithin(10000, 1, 1600)).toEqual({ width: 1600, height: 1 })
  })
})
```

- [ ] **Step 2: Verify failure, implement**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client` → FAIL.

`app/src/lib/photo.ts`:

```ts
const MAX_EDGE = 1600
const JPEG_QUALITY = 0.85

/** Proportional downscale so max(width,height) ≤ maxEdge. Never upscales. */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/** Re-encode a picked image to a bounded JPEG. ALWAYS re-encodes, even when
 *  already small — the re-encode is what strips EXIF/GPS before upload.
 *  Rejects when the browser cannot decode the file. */
export async function downscalePhoto(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_EDGE)
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')
    if (ctx === null) throw new Error('canvas 2d context unavailable')
    ctx.drawImage(bitmap, 0, 0, width, height)
    return await canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY })
  } finally {
    bitmap.close()
  }
}
```

(OffscreenCanvas + createImageBitmap are supported in all evergreen browsers incl. iOS Safari 17+; jsdom lacks both, so `downscalePhoto` is mocked in component tests — no direct unit test for it.)

- [ ] **Step 3: Verify pass, lint, typecheck, commit**

```bash
NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client && pnpm lint && pnpm typecheck
git add app/src/lib/photo.ts app/src/lib/photo.test.ts
git commit -m "feat: client-side photo downscale pipeline"
```

---

### Task 6: Server — store photo methods, photoRoutes, 413 mapping

**Files:**
- Modify: `app/server/sightings/store.ts`, `app/server/errorHandler.ts`
- Create: `app/server/sightings/photoRoutes.ts`
- Test: `app/server/sightings/photoRoutes.test.ts`, `app/server/errorHandler.test.ts` (append if the file exists, else the routes test covers 413)

**Interfaces:**
- Consumes: `httpValidation.js` (Task 2).
- Produces (Task 7 wires):

```ts
// store.ts additions (rows keep photoPath EXACTLY as stored — the /api/photos/<file> path):
async getById(id: string): Promise<Sighting | null>
async setPhotoPath(id: string, photoPath: string | null): Promise<Sighting | null>  // updated row, null if id unknown
// photoRoutes.ts:
export const PHOTO_FILENAME_RE: RegExp
export function sightingPhotoRouter(store: SightingsStore, writeGate: RequestHandler, photosDir: string): Router  // PUT/DELETE /:id/photo — merged into the sightings mount
export function photoFileRouter(photosDir: string): Router                                                        // GET /:filename — mounted at /api/photos
```

- [ ] **Step 1: Write the failing routes tests**

`app/server/sightings/photoRoutes.test.ts`:

```ts
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import express, { type Express, type RequestHandler } from 'express'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requireWriteAuth } from '../auth.js'
import { errorHandler } from '../errorHandler.js'
import { basic, withServer } from '../testUtils.js'
import { photoFileRouter, sightingPhotoRouter, PHOTO_FILENAME_RE } from './photoRoutes.js'
import type { Sighting, SightingsStore } from './store.js'

const ID = '3f9a26cc-1c0e-4c3a-9b52-08a1c2f4d9aa'
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])

function row(overrides: Partial<Sighting> = {}): Sighting {
  return {
    id: ID,
    emoji: '🦊',
    name: 'Mr Fox',
    sightedOn: '2026-07-04',
    sightedTime: null,
    place: null,
    comment: null,
    photoPath: null,
    createdAt: new Date('2026-07-04T12:00:00Z'),
    ...overrides,
  }
}

function fakeStore(overrides: Partial<SightingsStore> = {}): SightingsStore {
  return {
    list: vi.fn(async () => []),
    create: vi.fn(async () => row()),
    remove: vi.fn(async () => true),
    getById: vi.fn(async () => row()),
    setPhotoPath: vi.fn(async (_id, photoPath) => row({ photoPath })),
    ...overrides,
  }
}

let photosDir: string

beforeEach(async () => {
  photosDir = await mkdtemp(path.join(tmpdir(), 'photos-'))
})

const passGate: RequestHandler = (_req, _res, next) => next()

function appWith(store: SightingsStore, gate: RequestHandler = passGate): Express {
  const app = express()
  app.use('/api/sightings', sightingPhotoRouter(store, gate, photosDir))
  app.use('/api/photos', photoFileRouter(photosDir))
  app.use(errorHandler)
  return app
}

async function put(base: string, id: string, body: BodyInit | null, contentType = 'image/jpeg') {
  return fetch(`${base}/api/sightings/${id}/photo`, {
    method: 'PUT',
    headers: contentType === '' ? {} : { 'content-type': contentType },
    body,
  })
}

describe('PHOTO_FILENAME_RE', () => {
  it('accepts our generated shape and rejects traversal', () => {
    expect(PHOTO_FILENAME_RE.test(`${ID}-1751700000000.jpg`)).toBe(true)
    expect(PHOTO_FILENAME_RE.test('../etc/passwd')).toBe(false)
    expect(PHOTO_FILENAME_RE.test(`${ID}-1.png`)).toBe(false)
    expect(PHOTO_FILENAME_RE.test(`${ID}.jpg`)).toBe(false)
  })
})

describe('PUT /api/sightings/:id/photo', () => {
  it('writes the file, updates the store, and returns the updated sighting', async () => {
    const store = fakeStore()
    await withServer(appWith(store), async (base) => {
      const res = await put(base, ID, JPEG)
      expect(res.status).toBe(200)
      const body = (await res.json()) as { photoPath: string }
      expect(body.photoPath).toMatch(new RegExp(`^/api/photos/${ID}-\\d+\\.jpg$`))
      const filename = path.basename(body.photoPath)
      expect(store.setPhotoPath).toHaveBeenCalledWith(ID, `/api/photos/${filename}`)
      expect(await readFile(path.join(photosDir, filename))).toEqual(JPEG)
    })
  })

  it('deletes the previous file on replace', async () => {
    const oldName = `${ID}-1000.jpg`
    await writeFile(path.join(photosDir, oldName), JPEG)
    const store = fakeStore({
      getById: vi.fn(async () => row({ photoPath: `/api/photos/${oldName}` })),
    })
    await withServer(appWith(store), async (base) => {
      expect((await put(base, ID, JPEG)).status).toBe(200)
      const files = await readdir(photosDir)
      expect(files).toHaveLength(1)
      expect(files[0]).not.toBe(oldName)
    })
  })

  it.each([
    ['non-uuid id', (base: string) => put(base, '42', JPEG)],
    ['wrong content-type', (base: string) => put(base, ID, JPEG, 'image/png')],
    ['empty body', (base: string) => put(base, ID, null)],
  ])('400s on %s without touching the store', async (_label, mk) => {
    const store = fakeStore()
    await withServer(appWith(store), async (base) => {
      expect((await mk(base)).status).toBe(400)
      expect(store.setPhotoPath).not.toHaveBeenCalled()
    })
  })

  it('404s an unknown id', async () => {
    const store = fakeStore({ getById: vi.fn(async () => null) })
    await withServer(appWith(store), async (base) => {
      expect((await put(base, ID, JPEG)).status).toBe(404)
      expect((await readdir(photosDir))).toHaveLength(0)
    })
  })

  it('413s an oversized body with the payload envelope', async () => {
    const store = fakeStore()
    await withServer(appWith(store), async (base) => {
      const res = await put(base, ID, Buffer.alloc(7 * 1024 * 1024))
      expect(res.status).toBe(413)
      expect(await res.json()).toEqual({ error: 'payload too large' })
    })
  })

  it('is auth-gated', async () => {
    await withServer(appWith(fakeStore(), requireWriteAuth('natalie', 'sekrit')), async (base) => {
      expect((await put(base, ID, JPEG)).status).toBe(401)
    })
  })
})

describe('DELETE /api/sightings/:id/photo', () => {
  it('clears the path, removes the file, 204s; idempotent when no photo', async () => {
    const name = `${ID}-1000.jpg`
    await writeFile(path.join(photosDir, name), JPEG)
    const store = fakeStore({ getById: vi.fn(async () => row({ photoPath: `/api/photos/${name}` })) })
    await withServer(appWith(store), async (base) => {
      const res = await fetch(`${base}/api/sightings/${ID}/photo`, { method: 'DELETE' })
      expect(res.status).toBe(204)
      expect(store.setPhotoPath).toHaveBeenCalledWith(ID, null)
      expect(await readdir(photosDir)).toHaveLength(0)
    })
    await withServer(appWith(fakeStore()), async (base) => {
      expect((await fetch(`${base}/api/sightings/${ID}/photo`, { method: 'DELETE' })).status).toBe(204)
    })
  })

  it('404s unknown id and 400s non-uuid', async () => {
    await withServer(appWith(fakeStore({ getById: vi.fn(async () => null) })), async (base) => {
      expect((await fetch(`${base}/api/sightings/${ID}/photo`, { method: 'DELETE' })).status).toBe(404)
    })
    await withServer(appWith(fakeStore()), async (base) => {
      expect((await fetch(`${base}/api/sightings/42/photo`, { method: 'DELETE' })).status).toBe(400)
    })
  })
})

describe('GET /api/photos/:filename', () => {
  it('serves the file with immutable caching', async () => {
    const name = `${ID}-1000.jpg`
    await writeFile(path.join(photosDir, name), JPEG)
    await withServer(appWith(fakeStore()), async (base) => {
      const res = await fetch(`${base}/api/photos/${name}`)
      expect(res.status).toBe(200)
      expect(res.headers.get('cache-control')).toContain('immutable')
      expect(Buffer.from(await res.arrayBuffer())).toEqual(JPEG)
    })
  })

  it('400s bad filenames and 404s missing files', async () => {
    await withServer(appWith(fakeStore()), async (base) => {
      expect((await fetch(`${base}/api/photos/..%2Fsecret.jpg`)).status).toBe(400)
      expect((await fetch(`${base}/api/photos/${ID}-9.jpg`)).status).toBe(404)
    })
  })
})
```

- [ ] **Step 2: Verify failure, add store methods + 413 mapping**

Run: `pnpm vitest run --project unit` → FAIL (module missing; also the fake store now demands getById/setPhotoPath, surfacing type errors until Step 2 lands).

`app/server/sightings/store.ts` — add inside the returned object:

```ts
    async getById(id: string): Promise<Sighting | null> {
      const [row] = await db.select().from(sightings).where(eq(sightings.id, id))
      return row ?? null
    },

    async setPhotoPath(id: string, photoPath: string | null): Promise<Sighting | null> {
      const [row] = await db
        .update(sightings)
        .set({ photoPath })
        .where(eq(sightings.id, id))
        .returning()
      return row ?? null
    },
```

`app/server/errorHandler.ts` — extend the status extraction: after computing `status`, add

```ts
  if (status === 413) {
    res.status(413).json({ error: 'payload too large' })
    return
  }
```

(placed before the existing final `res.status(status)...` line; Express's raw-limit error carries `status: 413` and `type: 'entity.too.large'`).

- [ ] **Step 3: Implement photoRoutes**

`app/server/sightings/photoRoutes.ts`:

```ts
import { rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import express, { Router, type RequestHandler } from 'express'
import { UUID_RE, sendValidation } from '../httpValidation.js'
import type { SightingsStore } from './store.js'

export const PHOTO_FILENAME_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-\d+\.jpg$/i

const rawJpeg = express.raw({ type: 'image/jpeg', limit: '6mb' })

async function removePhotoFile(photosDir: string, photoPath: string | null): Promise<void> {
  if (photoPath === null) return
  // photoPath is the API path (/api/photos/<file>); basename is the disk name.
  await rm(path.join(photosDir, path.basename(photoPath)), { force: true }).catch(() => {
    // best-effort cleanup: a missing file must never fail the request
  })
}

export function sightingPhotoRouter(
  store: SightingsStore,
  writeGate: RequestHandler,
  photosDir: string,
): Router {
  const router = Router()

  router.put('/:id/photo', writeGate, rawJpeg, async (req, res) => {
    const { id } = req.params as { id: string }
    if (!UUID_RE.test(id)) {
      sendValidation(res, { id: 'must be a uuid' })
      return
    }
    // express.raw only parses matching content-types; anything else leaves a non-Buffer body.
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      sendValidation(res, { photo: 'must be a non-empty image/jpeg body' })
      return
    }
    const existing = await store.getById(id)
    if (existing === null) {
      res.status(404).json({ error: 'not found' })
      return
    }
    const filename = `${id.toLowerCase()}-${Date.now()}.jpg`
    await writeFile(path.join(photosDir, filename), req.body)
    const updated = await store.setPhotoPath(id, `/api/photos/${filename}`)
    if (updated === null) {
      // row vanished between getById and update (single-user app: effectively unreachable)
      await removePhotoFile(photosDir, `/api/photos/${filename}`)
      res.status(404).json({ error: 'not found' })
      return
    }
    await removePhotoFile(photosDir, existing.photoPath)
    res.json(updated)
  })

  router.delete('/:id/photo', writeGate, async (req, res) => {
    const { id } = req.params as { id: string }
    if (!UUID_RE.test(id)) {
      sendValidation(res, { id: 'must be a uuid' })
      return
    }
    const existing = await store.getById(id)
    if (existing === null) {
      res.status(404).json({ error: 'not found' })
      return
    }
    await store.setPhotoPath(id, null)
    await removePhotoFile(photosDir, existing.photoPath)
    res.status(204).end()
  })

  return router
}

export function photoFileRouter(photosDir: string): Router {
  const router = Router()

  router.get('/:filename', (req, res) => {
    const { filename } = req.params as { filename: string }
    if (!PHOTO_FILENAME_RE.test(filename)) {
      sendValidation(res, { filename: 'invalid photo name' })
      return
    }
    res.sendFile(filename, { root: photosDir, immutable: true, maxAge: '365d' }, (err) => {
      if (err !== undefined && !res.headersSent) {
        res.status(404).json({ error: 'not found' })
      }
    })
  })

  return router
}
```

- [ ] **Step 4: Verify pass, lint, typecheck, commit**

Run: `pnpm vitest run --project unit && pnpm lint && pnpm typecheck`
Expected: photoRoutes tests green; other unit suites unaffected (the fake sightings stores in `routes.test.ts`/`app.test.ts` need the two new methods added — mechanical `getById: vi.fn(async () => null), setPhotoPath: vi.fn(async () => null)` entries; do NOT alter their assertions).

```bash
git add app/server/sightings/store.ts app/server/sightings/photoRoutes.ts app/server/sightings/photoRoutes.test.ts app/server/errorHandler.ts app/server/sightings/routes.test.ts app/server/app.test.ts
git commit -m "feat: per-sighting photo endpoints with raw JPEG bodies and file lifecycle"
```

---

### Task 7: Wiring — app.ts photosDir dep, sighting-delete cleanup, integration, README

**Files:**
- Modify: `app/server/app.ts`, `app/server/index.ts`, `app/server/sightings/routes.ts` (delete cleanup), `app/server/app.test.ts` (deps), `docker-compose.yml` (PHOTOS_DIR env), `README.md`
- Test: `app/server/sightings/photos.integration.test.ts`

**Interfaces:**
- Consumes: Task 6's routers and store methods.
- Produces: `AppDeps` gains `photosDir: string`; `sightingsRouter(store, writeGate, photosDir)` (delete-cleanup needs it); DELETE of a sighting removes its photo file.

- [ ] **Step 1: Wire the app**

`app/server/app.ts`: `AppDeps` gains `photosDir: string`. Mounts become:

```ts
  app.use('/api/sightings', sightingsRouter(deps.sightingsStore, writeGate, deps.photosDir))
  app.use('/api/sightings', sightingPhotoRouter(deps.sightingsStore, writeGate, deps.photosDir))
  app.use('/api/photos', photoFileRouter(deps.photosDir))
  app.use('/api/profiles', profilesRouter(deps.profilesStore, writeGate))
```

`app/server/sightings/routes.ts`: signature `sightingsRouter(store, writeGate, photosDir: string)`; the DELETE handler fetches first and cleans up after:

```ts
  router.delete('/:id', writeGate, async (req, res) => {
    const { id } = req.params as { id: string }
    if (!UUID_RE.test(id)) {
      sendValidation(res, { id: 'must be a uuid' })
      return
    }
    const existing = await store.getById(id)
    const removed = await store.remove(id)
    if (!removed) {
      res.status(404).json({ error: 'not found' })
      return
    }
    if (existing !== null && existing.photoPath !== null) {
      await rm(path.join(photosDir, path.basename(existing.photoPath)), { force: true }).catch(() => {})
    }
    res.status(204).end()
  })
```

(add `import { rm } from 'node:fs/promises'` and `import path from 'node:path'`).

`app/server/index.ts`: `photosDir: process.env.PHOTOS_DIR ?? '/data/photos'` in the createApp call.
`app/server/app.test.ts`: `deps()` gains `photosDir: '/tmp/unused-photos'`.
`app/server/sightings/routes.test.ts` + `api.integration.test.ts`: pass a photosDir third arg (temp dir or `'/tmp/unused-photos'` where no file assertions).
`docker-compose.yml` app environment gains `PHOTOS_DIR: /data/photos` (explicit beats implicit).
`README.md` API block gains:

```
    PUT    /api/sightings/:id/photo                       # basic auth; raw image/jpeg body (≤6MB)
    DELETE /api/sightings/:id/photo                       # basic auth
    GET    /api/photos/:filename                          # public; immutable cache
```

- [ ] **Step 2: Write the integration lifecycle test**

`app/server/sightings/photos.integration.test.ts`:

```ts
import { mkdtemp, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import type { createDb } from '../db/index.js'
import { createProfilesStore } from '../profiles/store.js'
import { createTestDb } from '../testDb.js'
import { basic, withServer } from '../testUtils.js'
import { createSightingsStore } from './store.js'

const AUTH = basic('natalie', 'sekrit')
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9, 9])

describe('photo lifecycle against real postgres + disk', () => {
  let handle: ReturnType<typeof createDb>
  let photosDir: string

  beforeAll(async () => {
    handle = await createTestDb()
    photosDir = await mkdtemp(path.join(tmpdir(), 'photos-'))
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
      photosDir,
    })
  }

  it('PUT → GET → replace (old file gone) → DELETE photo → sighting delete removes file', async () => {
    await withServer(app(), async (base) => {
      const created = await fetch(`${base}/api/sightings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: AUTH },
        body: JSON.stringify({ emoji: '🦊', sightedOn: '2026-07-04' }),
      })
      const sighting = (await created.json()) as { id: string }

      const put1 = await fetch(`${base}/api/sightings/${sighting.id}/photo`, {
        method: 'PUT',
        headers: { 'content-type': 'image/jpeg', authorization: AUTH },
        body: JPEG,
      })
      expect(put1.status).toBe(200)
      const { photoPath } = (await put1.json()) as { photoPath: string }

      const got = await fetch(`${base}${photoPath}`)
      expect(got.status).toBe(200)
      expect(got.headers.get('cache-control')).toContain('immutable')

      const put2 = await fetch(`${base}/api/sightings/${sighting.id}/photo`, {
        method: 'PUT',
        headers: { 'content-type': 'image/jpeg', authorization: AUTH },
        body: JPEG,
      })
      const second = (await put2.json()) as { photoPath: string }
      expect(second.photoPath).not.toBe(photoPath)
      expect(await readdir(photosDir)).toHaveLength(1)

      const del = await fetch(`${base}/api/sightings/${sighting.id}/photo`, {
        method: 'DELETE',
        headers: { authorization: AUTH },
      })
      expect(del.status).toBe(204)
      expect(await readdir(photosDir)).toHaveLength(0)

      const put3 = await fetch(`${base}/api/sightings/${sighting.id}/photo`, {
        method: 'PUT',
        headers: { 'content-type': 'image/jpeg', authorization: AUTH },
        body: JPEG,
      })
      expect(put3.status).toBe(200)
      const gone = await fetch(`${base}/api/sightings/${sighting.id}`, {
        method: 'DELETE',
        headers: { authorization: AUTH },
      })
      expect(gone.status).toBe(204)
      expect(await readdir(photosDir)).toHaveLength(0)
    })
  })
})
```

- [ ] **Step 3: Full suite, lint, typecheck, commit**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all green.

```bash
git add app/server docker-compose.yml README.md
git commit -m "feat: wire photo routes and sighting-delete file cleanup"
```

---

### Task 8: Client data layer — api photo calls, addSighting returns, applySighting

**Files:**
- Modify: `app/src/api.ts`, `app/src/hooks/useSightings.ts`
- Test: `app/src/api.test.ts` (append), `app/src/hooks/useSightings.test.ts` (append)

**Interfaces:**
- Produces (Tasks 9–10 consume):

```ts
// api.ts
export async function uploadPhoto(id: string, photo: Blob, authHeader: string): Promise<Sighting>
export async function deletePhoto(id: string, authHeader: string): Promise<void>
// useSightings
addSighting(fields, authHeader): Promise<Sighting>          // now RETURNS the created row
applySighting(updated: Sighting): void                       // replaces the matching row in place
```

- [ ] **Step 1: Append failing api tests**

`app/src/api.test.ts` (uses `stubFetchQueue`; a `SIGHTING` response literal exists in the file — reuse it or build with `makeSighting()`):

```ts
describe('photo api', () => {
  it('uploads via PUT with the blob body and auth', async () => {
    const updated = makeSighting({ photoPath: '/api/photos/x-1.jpg' })
    const mock = stubFetchQueue([{ status: 200, body: updated }])
    const blob = new Blob(['jpg'], { type: 'image/jpeg' })
    await expect(uploadPhoto(updated.id, blob, 'Basic x')).resolves.toEqual(updated)
    expect(mock).toHaveBeenCalledWith(`/api/sightings/${updated.id}/photo`, {
      method: 'PUT',
      headers: { 'content-type': 'image/jpeg', authorization: 'Basic x' },
      body: blob,
    })
  })

  it('deletes via DELETE and throws ApiError on failure', async () => {
    stubFetchQueue([{ status: 204, body: null }, { status: 503, body: { error: 'writes disabled' } }])
    await expect(deletePhoto('id-1', 'Basic x')).resolves.toBeUndefined()
    await expect(deletePhoto('id-1', 'Basic x')).rejects.toMatchObject({ status: 503 })
  })
})
```

- [ ] **Step 2: Implement api.ts additions**

```ts
export async function uploadPhoto(id: string, photo: Blob, authHeader: string): Promise<Sighting> {
  const res = await fetch(`/api/sightings/${id}/photo`, {
    method: 'PUT',
    headers: { 'content-type': 'image/jpeg', authorization: authHeader },
    body: photo,
  })
  if (!res.ok) throw new ApiError(res.status)
  return (await res.json()) as Sighting
}

export async function deletePhoto(id: string, authHeader: string): Promise<void> {
  const res = await fetch(`/api/sightings/${id}/photo`, {
    method: 'DELETE',
    headers: { authorization: authHeader },
  })
  if (!res.ok) throw new ApiError(res.status)
}
```

- [ ] **Step 3: useSightings — return created row + applySighting (tests first)**

Append to `app/src/hooks/useSightings.test.ts`:

```ts
  it('addSighting resolves with the created row', async () => {
    const created = makeSighting()
    stubFetchQueue([
      { status: 200, body: [] },
      { status: 201, body: created },
    ])
    const { result } = renderHook(() => useSightings())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    let returned: Sighting | undefined
    await act(async () => {
      returned = await result.current.addSighting({ emoji: '🦊', sightedOn: '2026-07-01' }, 'Basic x')
    })
    expect(returned).toEqual(created)
  })

  it('applySighting replaces the matching row in place', async () => {
    const original = makeSighting()
    stubFetchQueue([{ status: 200, body: [original] }])
    const { result } = renderHook(() => useSightings())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    const updated = { ...original, photoPath: '/api/photos/x-1.jpg' }
    act(() => result.current.applySighting(updated))
    expect(result.current.sightings).toEqual([updated])
  })
```

Implement: `SightingsState.addSighting` return type becomes `Promise<Sighting>`; the callback does `return created` after the prepend. Add:

```ts
  const applySighting = useCallback((updated: Sighting) => {
    setSightings((current) => current.map((s) => (s.id === updated.id ? updated : s)))
  }, [])
```

and export it in the returned object + `SightingsState` type.

- [ ] **Step 4: Verify pass, lint, typecheck, commit**

```bash
NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client && pnpm lint && pnpm typecheck
git add app/src/api.ts app/src/api.test.ts app/src/hooks/useSightings.ts app/src/hooks/useSightings.test.ts
git commit -m "feat: photo api calls; addSighting returns the row; applySighting"
```

---

### Task 9: PhotoControl + DetailsForm photo + best-effort upload in the flow

**Files:**
- Create: `app/src/components/PhotoControl.tsx`
- Modify: `app/src/components/DetailsForm.tsx`, `app/src/components/LogSightingFlow.tsx`, `app/src/App.tsx`, `app/src/index.css`
- Test: `app/src/components/PhotoControl.test.tsx`, `app/src/components/LogSightingFlow.friends.test.tsx` (append two flow tests — file is NOT frozen)

**Interfaces:**
- Consumes: `downscalePhoto` (Task 5 — mocked in tests via `vi.mock('../lib/photo', ...)`), `uploadPhoto` (Task 8).
- Produces:

```tsx
// PhotoControl
type PhotoControlProps = { photo: Blob | null; onPhoto(photo: Blob | null): void }
// DetailsForm props += { photoControl?: boolean }; onSave opts become { saveAsFriend: boolean; photo: Blob | null }
// LogSightingFlow props += { onUploadPhoto?: (id: string, photo: Blob, authHeader: string) => Promise<void> }
// App passes onUploadPhoto wrapping uploadPhoto + applySighting
```

- [ ] **Step 1: Write failing PhotoControl tests**

`app/src/components/PhotoControl.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PhotoControl } from './PhotoControl'

const downscalePhoto = vi.hoisted(() => vi.fn())
vi.mock('../lib/photo', () => ({ downscalePhoto }))

const FILE = new File(['raw'], 'pic.heic', { type: 'image/heic' })
const SMALL = new Blob(['small'], { type: 'image/jpeg' })

describe('PhotoControl', () => {
  it('picks → downscales → reports the blob and shows the added state', async () => {
    downscalePhoto.mockResolvedValueOnce(SMALL)
    const onPhoto = vi.fn()
    render(<PhotoControl photo={null} onPhoto={onPhoto} />)
    await userEvent.upload(screen.getByLabelText(/add a photo/i), FILE)
    await waitFor(() => expect(onPhoto).toHaveBeenCalledWith(SMALL))
  })

  it('shows the added state with a clear button when a photo is held', async () => {
    const onPhoto = vi.fn()
    render(<PhotoControl photo={SMALL} onPhoto={onPhoto} />)
    expect(screen.getByText('✓ Photo added')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Remove photo' }))
    expect(onPhoto).toHaveBeenCalledWith(null)
  })

  it('shows a friendly error when the browser cannot decode the pick', async () => {
    downscalePhoto.mockRejectedValueOnce(new Error('undecodable'))
    render(<PhotoControl photo={null} onPhoto={vi.fn()} />)
    await userEvent.upload(screen.getByLabelText(/add a photo/i), FILE)
    expect(await screen.findByText("Couldn't read that photo")).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Implement PhotoControl + CSS**

`app/src/components/PhotoControl.tsx`:

```tsx
import { useRef, useState } from 'react'
import { downscalePhoto } from '../lib/photo'

type Props = {
  photo: Blob | null
  onPhoto: (photo: Blob | null) => void
}

export function PhotoControl({ photo, onPhoto }: Props) {
  const [preparing, setPreparing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function onPick(file: File | undefined) {
    if (file === undefined) return
    setPreparing(true)
    setError(null)
    try {
      onPhoto(await downscalePhoto(file))
    } catch {
      setError("Couldn't read that photo")
    } finally {
      setPreparing(false)
      if (inputRef.current !== null) inputRef.current.value = ''
    }
  }

  if (photo !== null) {
    return (
      <div className="photo-control added">
        <span>✓ Photo added</span>
        <button type="button" className="photo-clear" aria-label="Remove photo" onClick={() => onPhoto(null)}>
          ✕
        </button>
      </div>
    )
  }

  return (
    <div className="photo-control">
      <label className={preparing ? 'photo-add preparing' : 'photo-add'}>
        {preparing ? 'Preparing…' : '📷 Add a photo'}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          disabled={preparing}
          onChange={(e) => void onPick(e.target.files?.[0])}
        />
      </label>
      {error !== null && <p className="flow-error" data-testid="photo-error">{error}</p>}
    </div>
  )
}
```

CSS append to `app/src/index.css` (new vars in `:root`: `--photo-border: #9DB6E8; --photo-text: #5F80C7;` — success colors `#5FBFA6/#3E9C81/#EFFAF3` already exist as tokens or add `--photo-ok-border/--photo-ok-text/--photo-ok-bg`):

```css
.photo-control { margin-top: 12px; }

.photo-add {
  display: block;
  border: 2px dashed var(--photo-border);
  color: var(--photo-text);
  border-radius: 12px;
  padding: 12px;
  text-align: center;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
}

.photo-add input { display: none; }

.photo-add.preparing { opacity: 0.6; }

.photo-control.added {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 2px solid var(--photo-ok-border);
  color: var(--photo-ok-text);
  background: var(--photo-ok-bg);
  border-radius: 12px;
  padding: 12px;
  font-weight: 700;
  font-size: 13px;
}

.photo-clear {
  border: none;
  background: none;
  color: inherit;
  font-size: 14px;
  cursor: pointer;
  padding: 2px 6px;
}
```

- [ ] **Step 3: DetailsForm hosts it; flow uploads best-effort; App wires**

`DetailsForm.tsx`: props gain `photoControl?: boolean`; state `const [photo, setPhoto] = useState<Blob | null>(null)`; render `{photoControl && <PhotoControl photo={photo} onPhoto={setPhoto} />}` directly ABOVE the friend-status/checkbox slot. `save()`'s branching becomes feature-keyed (photo must flow even if the friend toggle is ever absent):

```ts
    if (friendToggle || photoControl) {
      onSave(fields, {
        saveAsFriend: friendToggle === true && saveAsFriend && trimmedName !== '' && liveFriend === null,
        photo,
      })
    } else {
      onSave(fields)
    }
```

(opts type widens to `{ saveAsFriend: boolean; photo: Blob | null }` — plain callers unaffected since opts stays optional.)

`LogSightingFlow.tsx`: props gain `onUploadPhoto?: (id: string, photo: Blob, authHeader: string) => Promise<void>`; the `onSave` prop type becomes `(fields, authHeader) => Promise<Sighting | void>` — tolerant on purpose: the FROZEN `LogSightingFlow.test.tsx` mocks resolve undefined and must keep compiling byte-unchanged. In `save(fields, opts?)`, after the sighting saves (independent of the friend branch):

```ts
        const created = await onSave(fields, authHeader)
        if (opts?.photo != null && onUploadPhoto !== undefined && created != null) {
          // Best-effort like the friend save: the sighting is logged; Detail's
          // add-photo is the recovery path.
          try {
            await onUploadPhoto(created.id, opts.photo, authHeader)
          } catch {
            // silent by design
          }
        }
```

DetailsForm gets `photoControl={onUploadPhoto !== undefined}`.

`App.tsx`:

```tsx
        onUploadPhoto={async (id, photo, authHeader) => {
          applySighting(await uploadPhoto(id, photo, authHeader))
        }}
```

(destructure `applySighting` from `useSightings()`, import `uploadPhoto` from './api').

- [ ] **Step 4: Append flow tests (friends test file), full gate, commit**

Append to `LogSightingFlow.friends.test.tsx` (mock `../lib/photo` at top of file — the mock only fires in the new tests):

```tsx
  it('uploads the picked photo best-effort after the sighting saves', async () => {
    setCredentials('sekrit')
    downscalePhoto.mockResolvedValueOnce(new Blob(['x'], { type: 'image/jpeg' }))
    const created = makeSighting()
    const onSave = vi.fn(async () => created)
    const onUploadPhoto = vi.fn(async () => {})
    render(
      <LogSightingFlow open onClose={() => {}} onSave={onSave} onLogged={vi.fn()} onSaveFriend={vi.fn(async () => {})} onUploadPhoto={onUploadPhoto} />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Fox' }))
    await userEvent.upload(screen.getByLabelText(/add a photo/i), new File(['p'], 'p.jpg', { type: 'image/jpeg' }))
    await screen.findByText('✓ Photo added')
    await userEvent.click(screen.getByRole('button', { name: /save sighting/i }))
    await vi.waitFor(() =>
      expect(onUploadPhoto).toHaveBeenCalledWith(created.id, expect.any(Blob), 'Basic ' + btoa('natalie:sekrit')),
    )
  })

  it('a failed photo upload never blocks the logged toast', async () => {
    setCredentials('sekrit')
    downscalePhoto.mockResolvedValueOnce(new Blob(['x'], { type: 'image/jpeg' }))
    const onLogged = vi.fn()
    render(
      <LogSightingFlow
        open
        onClose={() => {}}
        onSave={vi.fn(async () => makeSighting())}
        onLogged={onLogged}
        onUploadPhoto={vi.fn(async () => {
          throw new Error('network down')
        })}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Fox' }))
    await userEvent.upload(screen.getByLabelText(/add a photo/i), new File(['p'], 'p.jpg', { type: 'image/jpeg' }))
    await screen.findByText('✓ Photo added')
    await userEvent.click(screen.getByRole('button', { name: /save sighting/i }))
    await vi.waitFor(() => expect(onLogged).toHaveBeenCalledTimes(1))
  })
```

(The file needs `makeSighting` imported from `../test/helpers` and the hoisted `downscalePhoto` mock; PhotoControl only renders when `onUploadPhoto` is passed, so every existing test in this file and the frozen file is unaffected.)

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client && pnpm lint && pnpm typecheck` — green; `git status`: frozen files untouched.

```bash
git add app/src
git commit -m "feat: photo control in the log form with best-effort upload"
```

---

### Task 10: Sighting Detail — photo block, add/replace/two-tap remove

**Files:**
- Modify: `app/src/components/SightingDetail.tsx`, `app/src/App.tsx`, `app/src/index.css`
- Test: `app/src/components/SightingDetail.test.tsx` (append)

**Interfaces:**
- Consumes: single write instance (Task 1), `uploadPhoto`/`deletePhoto`/`applySighting` (Task 8), `downscalePhoto` (mocked).
- Produces: SightingDetail props += `uploadPhoto(id, photo, authHeader): Promise<void>` and `removePhoto(id, authHeader): Promise<void>` (App wraps api + applySighting; DELETE clears locally via `applySighting({ ...sighting, photoPath: null })`).

- [ ] **Step 1: Append failing Detail tests**

Append to `SightingDetail.test.tsx` (extend `renderDetail` defaults with `uploadPhoto: vi.fn(async () => {})`, `removePhoto: vi.fn(async () => {})`; hoisted `vi.mock('../lib/photo', ...)` at file top with the other mocks):

```tsx
describe('photo block', () => {
  const PHOTO_MESSAGES = { disabled: 'Photos are disabled right now', failed: "Couldn't update the photo — try again" }
  void PHOTO_MESSAGES

  it('renders the img when the sighting has a photo', () => {
    renderDetail({ sighting: makeSighting({ photoPath: '/api/photos/a-1.jpg' }) })
    expect(screen.getByRole('img')).toHaveAttribute('src', '/api/photos/a-1.jpg')
    expect(screen.getByRole('button', { name: 'Replace photo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove photo' })).toBeInTheDocument()
  })

  it('adds a photo immediately from the picker when there is none', async () => {
    setCredentials('sekrit')
    downscalePhoto.mockResolvedValueOnce(new Blob(['x'], { type: 'image/jpeg' }))
    const uploadPhoto = vi.fn(async () => {})
    const { sighting } = renderDetail({ uploadPhoto })
    await userEvent.upload(screen.getByLabelText(/add a photo/i), new File(['p'], 'p.jpg', { type: 'image/jpeg' }))
    await vi.waitFor(() =>
      expect(uploadPhoto).toHaveBeenCalledWith(sighting.id, expect.any(Blob), 'Basic ' + btoa('natalie:sekrit')),
    )
  })

  it('removes with the two-tap confirm', async () => {
    setCredentials('sekrit')
    const removePhoto = vi.fn(async () => {})
    const sighting = makeSighting({ photoPath: '/api/photos/a-1.jpg' })
    renderDetail({ sighting, removePhoto })
    await userEvent.click(screen.getByRole('button', { name: 'Remove photo' }))
    expect(removePhoto).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Really remove?' }))
    await vi.waitFor(() => expect(removePhoto).toHaveBeenCalledWith(sighting.id, expect.any(String)))
  })

  it('replaces via the picker', async () => {
    setCredentials('sekrit')
    downscalePhoto.mockResolvedValueOnce(new Blob(['y'], { type: 'image/jpeg' }))
    const uploadPhoto = vi.fn(async () => {})
    const sighting = makeSighting({ photoPath: '/api/photos/a-1.jpg' })
    renderDetail({ sighting, uploadPhoto })
    await userEvent.upload(screen.getByLabelText('Replace photo'), new File(['q'], 'q.jpg', { type: 'image/jpeg' }))
    await vi.waitFor(() => expect(uploadPhoto).toHaveBeenCalledWith(sighting.id, expect.any(Blob), expect.any(String)))
  })
})
```

- [ ] **Step 2: Implement**

In `SightingDetail.tsx` — props gain `uploadPhoto`/`removePhoto` per Interfaces. Between the place line and the comment, insert the photo block:

```tsx
      {sighting.photoPath !== null ? (
        <div className="detail-photo-block">
          <img className="detail-photo" src={sighting.photoPath} alt="" loading="lazy" />
          <div className="photo-actions">
            <label className="photo-action">
              Replace photo
              <input
                type="file"
                accept="image/*"
                aria-label="Replace photo"
                disabled={write.busy}
                onChange={(e) => void onPickPhoto(e.target.files?.[0])}
              />
            </label>
            <button
              type="button"
              className={confirmingPhoto ? 'photo-action danger confirming' : 'photo-action danger'}
              disabled={write.busy}
              onClick={onRemovePhotoClick}
            >
              {confirmingPhoto ? 'Really remove?' : 'Remove photo'}
            </button>
          </div>
        </div>
      ) : (
        <PhotoControl photo={null} onPhoto={(blob) => void onDetailPhoto(blob)} />
      )}
```

with handlers (single `write` instance, photo messages verbatim):

```tsx
  const [confirmingPhoto, setConfirmingPhoto] = useState(false)
  const photoConfirmTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(photoConfirmTimer.current), [])
  const [photoError, setPhotoError] = useState<string | null>(null)

  const PHOTO_MESSAGES = { disabled: 'Photos are disabled right now', failed: "Couldn't update the photo — try again" }

  async function onPickPhoto(file: File | undefined) {
    if (file === undefined) return
    setPhotoError(null)
    try {
      const blob = await downscalePhoto(file)
      write.run((authHeader) => uploadPhoto(sighting.id, blob, authHeader), () => {}, PHOTO_MESSAGES)
    } catch {
      setPhotoError("Couldn't read that photo")
    }
  }

  function onDetailPhoto(blob: Blob | null) {
    if (blob === null) return
    write.run((authHeader) => uploadPhoto(sighting.id, blob, authHeader), () => {}, PHOTO_MESSAGES)
  }

  function onRemovePhotoClick() {
    if (!confirmingPhoto) {
      setConfirmingPhoto(true)
      clearTimeout(photoConfirmTimer.current)
      photoConfirmTimer.current = setTimeout(() => setConfirmingPhoto(false), CONFIRM_WINDOW_MS)
      return
    }
    clearTimeout(photoConfirmTimer.current)
    setConfirmingPhoto(false)
    write.run((authHeader) => removePhoto(sighting.id, authHeader), () => {}, PHOTO_MESSAGES)
  }
```

Render `photoError` under the block: `{photoError !== null && <p className="flow-error">{photoError}</p>}`. Import `PhotoControl` and `downscalePhoto`. NOTE the add-mode path goes through PhotoControl (which downscales internally) — `onDetailPhoto` receives the already-downscaled blob; `onPickPhoto` (replace) downscales itself since it uses a bare input.

`App.tsx` — thread the two handlers to SightingDetail:

```tsx
              uploadPhoto={async (id, photo, authHeader) => {
                applySighting(await uploadPhoto(id, photo, authHeader))
              }}
              removePhoto={async (id, authHeader) => {
                await deletePhoto(id, authHeader)
                applySighting({ ...current, photoPath: null })
              }}
```

where `current` is the sighting object already resolved for the open sheet in that JSX branch (reuse the variable the branch already has; import `deletePhoto`).

CSS:

```css
.detail-photo-block { margin: 12px 0; }

.detail-photo {
  width: 100%;
  max-height: 260px;
  object-fit: cover;
  border-radius: 14px;
  display: block;
}

.photo-actions {
  display: flex;
  gap: 16px;
  justify-content: center;
  margin-top: 8px;
}

.photo-action {
  border: none;
  background: none;
  padding: 0;
  font-size: 12px;
  font-weight: 700;
  color: var(--photo-text);
  cursor: pointer;
  text-decoration: underline;
}

.photo-action input { display: none; }

.photo-action.danger { color: var(--danger); }

.photo-action:disabled { opacity: 0.5; cursor: default; }
```

- [ ] **Step 3: Full gate, commit**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client && pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: all green.

```bash
git add app/src
git commit -m "feat: photo block in sighting detail with add/replace/remove"
```

---

### Task 11: End-to-end verification (spec Definition of Done)

**Files:** none (verification; fix-forward only for transcription bugs)

- [ ] **Step 1: Stack up**

`cp /Users/james/projects/github/jamesawesome/nataliesawacritter.info/.env .env` (worktree only; skip if already at repo root); stop any stale 8080 container (report); `docker compose up -d --build`; health `{"ok":true,"db":true}`; `docker compose logs app | grep -i migrat` shows 0002 applied.

- [ ] **Step 2: DoD via curl**

```bash
PASS=$(grep '^WRITE_PASSWORD=' .env | cut -d= -f2); AUTH="natalie:$PASS"
# tiny real JPEG:
printf '\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xd9' > /tmp/t.jpg
SID=$(curl -s -X POST -u "$AUTH" -H 'content-type: application/json' -d '{"emoji":"🦊","sightedOn":"2026-07-04"}' http://localhost:8080/api/sightings | python3 -c 'import json,sys;print(json.load(sys.stdin)["id"])')
P1=$(curl -s -X PUT -u "$AUTH" -H 'content-type: image/jpeg' --data-binary @/tmp/t.jpg http://localhost:8080/api/sightings/$SID/photo | python3 -c 'import json,sys;print(json.load(sys.stdin)["photoPath"])')
curl -sI http://localhost:8080$P1 | grep -i cache-control          # immutable
P2=$(curl -s -X PUT -u "$AUTH" -H 'content-type: image/jpeg' --data-binary @/tmp/t.jpg http://localhost:8080/api/sightings/$SID/photo | python3 -c 'import json,sys;print(json.load(sys.stdin)["photoPath"])')
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080$P1   # 404 (old file gone)
docker compose exec app ls /data/photos                              # exactly one file
curl -s -X DELETE -u "$AUTH" -o /dev/null -w '%{http_code}\n' http://localhost:8080/api/sightings/$SID/photo  # 204
docker compose exec app ls /data/photos                              # empty
# 0002 end-to-end:
curl -s -X POST -u "$AUTH" -H 'content-type: application/json' -d '{"emoji":"🦊","name":"Mr Fox"}' http://localhost:8080/api/profiles > /dev/null
curl -s -o /dev/null -w '%{http_code}\n' -X POST -u "$AUTH" -H 'content-type: application/json' -d '{"emoji":"🦊","name":"mr fox"}' http://localhost:8080/api/profiles   # 409
```

Then delete the test sighting + profile (authed DELETEs), verify lists empty, LEAVE THE STACK UP for the browser pass.

- [ ] **Step 3: Full local gate**

From `app/`: `pnpm lint && pnpm typecheck && pnpm test:coverage && pnpm build` — green.

---

## Final verification (spec Definition of Done)

- [ ] Browser (localhost:8080): log with a photo → "✓ Photo added" → Detail shows the image; add to an old sighting from Detail; replace (old file gone from volume); two-tap remove; the served file is a small JPEG.
- [ ] curl lifecycle + 0002 conflict per Task 11.
- [ ] Frozen files byte-unchanged; full suite, lint, typecheck, build, CI green.
