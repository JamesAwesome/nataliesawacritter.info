# Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Act on the security audit — server-side photo GPS stripping, a public-safety warning, correlation-metadata trimming, CSP/security headers, rate limiting, and a push SSRF allowlist — keeping the app publicly readable.

**Architecture:** Small, independent hardening changes on the Express API + one client copy change. Two new server deps (`helmet`, `express-rate-limit`). No DB change.

**Tech Stack:** Express 5, React 19, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-07-06-security-hardening-design.md`

## Global Constraints

- Run from `app/`; raw vitest needs `NODE_OPTIONS=--no-experimental-webstorage`; server imports use `.js` extensions; no raw hex in TSX.
- **Two intentional new deps** (this overrides the usual no-new-deps preference): `helmet` and `express-rate-limit`. Both are pure-JS (no install build scripts), so no `pnpm-workspace.yaml` allowlist change is needed; commit the updated `pnpm-lock.yaml`.
- Reads stay public; do NOT gate reads or alter the public `place` text value.
- Origin is reachable only via the Cloudflare tunnel → the `CF-Connecting-IP` header is trustworthy for rate-limit keying.
- Server test harness (`server/app.test.ts`): `withServer(createApp(deps(overrides)), async (base) => { … fetch(`${base}/…`) })`. `deps()` builds `AppDeps`.

---

### Task 1: server-side JPEG EXIF/GPS strip + random photo filename

**Files:**
- Create: `app/server/sightings/stripJpeg.ts`, `app/server/sightings/stripJpeg.test.ts`
- Modify: `app/server/sightings/photoRoutes.ts` (PUT handler + `PHOTO_FILENAME_RE`)

**Interfaces:**
- Produces: `stripJpegExif(buf: Buffer): Buffer` — returns the JPEG with all APP1 (EXIF/XMP/GPS) segments removed; throws `Error` if `buf` is not a JPEG.

- [ ] **Step 1: Write the failing stripJpeg test**

Create `app/server/sightings/stripJpeg.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { stripJpegExif } from './stripJpeg.js'

// Minimal JPEG: SOI, an APP1/EXIF segment carrying fake GPS bytes, a DQT-ish
// APP0, an SOS with tiny scan data, EOI.
function seg(marker: number, payload: Buffer): Buffer {
  const len = Buffer.alloc(2)
  len.writeUInt16BE(payload.length + 2, 0)
  return Buffer.concat([Buffer.from([0xff, marker]), len, payload])
}
const SOI = Buffer.from([0xff, 0xd8])
const EOI = Buffer.from([0xff, 0xd9])
const app1 = seg(0xe1, Buffer.concat([Buffer.from('Exif\0\0'), Buffer.from('GPSLAT-40.7128')]))
const app0 = seg(0xe0, Buffer.from('JFIF\0'))
const sos = Buffer.concat([seg(0xda, Buffer.from([0x00, 0x01])), Buffer.from([0x12, 0x34])]) // header + scan bytes

describe('stripJpegExif', () => {
  it('removes APP1 (EXIF/GPS) while keeping the rest of the JPEG', () => {
    const input = Buffer.concat([SOI, app1, app0, sos, EOI])
    const out = stripJpegExif(input)
    expect(out.subarray(0, 2)).toEqual(SOI) // still a JPEG
    expect(out.includes(Buffer.from('GPSLAT'))).toBe(false) // GPS gone
    expect(out.includes(Buffer.from('JFIF'))).toBe(true) // APP0 preserved
    expect(out.includes(Buffer.from([0xff, 0xe1]))).toBe(false) // no APP1 marker
    expect(out.length).toBeLessThan(input.length)
  })

  it('throws on non-JPEG bytes', () => {
    expect(() => stripJpegExif(Buffer.from('this is not a jpeg'))).toThrow()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project unit server/sightings/stripJpeg.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `stripJpeg.ts`**

Create `app/server/sightings/stripJpeg.ts`:

```ts
/** Remove all APP1 segments (EXIF + XMP — where GPS/location metadata lives) from
 *  a JPEG, copying every other segment (and the scan data) through unchanged.
 *  Throws if the buffer is not a JPEG. Defense-in-depth: the client already
 *  re-encodes via canvas, which strips EXIF; this backstops non-SPA uploads. */
export function stripJpegExif(buf: Buffer): Buffer {
  if (buf.length < 2 || buf[0] !== 0xff || buf[1] !== 0xd8) {
    throw new Error('not a JPEG')
  }
  const parts: Buffer[] = [buf.subarray(0, 2)] // SOI
  let i = 2
  while (i + 1 < buf.length) {
    if (buf[i] !== 0xff) {
      parts.push(buf.subarray(i)) // not marker-aligned; copy remainder verbatim
      return Buffer.concat(parts)
    }
    const marker = buf[i + 1]
    if (marker === 0xd9 || marker === 0xda) {
      // EOI, or SOS (scan data follows to EOI) — copy this + everything after.
      parts.push(buf.subarray(i))
      return Buffer.concat(parts)
    }
    if (marker >= 0xd0 && marker <= 0xd7) {
      parts.push(buf.subarray(i, i + 2)) // RSTn: standalone, no length
      i += 2
      continue
    }
    const len = buf.readUInt16BE(i + 2)
    const end = i + 2 + len
    if (end > buf.length) throw new Error('malformed JPEG segment')
    if (marker !== 0xe1) parts.push(buf.subarray(i, end)) // keep all but APP1
    i = end
  }
  return Buffer.concat(parts)
}
```

- [ ] **Step 4: Run to verify pass**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project unit server/sightings/stripJpeg.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire it into the PUT route + random filename (TDD the route)**

In `app/server/sightings/photoRoutes.ts`:

Add the import and `node:crypto`:

```ts
import { randomUUID } from 'node:crypto'
import { stripJpegExif } from './stripJpeg.js'
```

Change `PHOTO_FILENAME_RE` so **new** uploads are `<uuid>.jpg` while **existing**
on-disk photos (`<uuid>-<epoch>.jpg`, from before this change) still serve — the
`-<epoch>` suffix becomes optional. (Without this, already-uploaded photos would
404 after deploy.)

```ts
export const PHOTO_FILENAME_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(-\d+)?\.jpg$/i
```

In the PUT handler, replace the body-write block. After the `Buffer.isBuffer` check, strip EXIF (400 on failure) and use a random filename:

```ts
    let clean: Buffer
    try {
      clean = stripJpegExif(req.body)
    } catch {
      sendValidation(res, { photo: 'must be a valid image/jpeg' })
      return
    }
    const existing = await store.getById(id)
    if (existing === null) {
      res.status(404).json({ error: 'not found' })
      return
    }
    const filename = `${randomUUID()}.jpg`
    await writeFile(path.join(photosDir, filename), clean)
```

(The rest — `setPhotoPath`, cleanup, response — is unchanged.)

- [ ] **Step 6: Update the photoRoutes tests**

In `app/server/sightings/photoRoutes.test.ts`: any assertion that the stored `photoPath`/filename matches the old `<id>-<epoch>.jpg` shape must change to the new `PHOTO_FILENAME_RE` (`<uuid>.jpg`). Add a case: a `PUT` with a **non-JPEG** buffer body (`Buffer.from('nope')` sent as `content-type: image/jpeg`) → 400 with `details.photo`. (A well-formed minimal JPEG like Task-1's `input` buffer should still succeed → 200.) Mirror the file's existing `withServer`/`basic` auth harness.

- [ ] **Step 7: Full check and commit**

Run: `pnpm test && pnpm lint && pnpm typecheck && pnpm build`
Expected: green (integration/photo tests included).

```bash
git add server/sightings/stripJpeg.ts server/sightings/stripJpeg.test.ts server/sightings/photoRoutes.ts server/sightings/photoRoutes.test.ts
git commit -m "feat: strip photo EXIF/GPS server-side and randomize photo filenames"
```

---

### Task 2: coarsen `createdAt` to the minute in the public API

**Files:**
- Modify: `app/server/sightings/routes.ts` (GET handler)
- Test: `app/server/sightings/routes.test.ts`

**Interfaces:**
- Consumes: `store.list()` returning `Sighting[]` (with a `createdAt: Date`).
- Produces: `GET /api/sightings` responses whose `createdAt` has seconds/ms zeroed.

- [ ] **Step 1: Update the GET test to expect minute-coarsened createdAt**

In `app/server/sightings/routes.test.ts`, the existing test "returns the store list as JSON with ISO createdAt" (~line 44) currently uses a fixture `createdAt: new Date('2026-07-03T12:00:00Z')` (already on the minute). Change the fixture's `createdAt` to a value with non-zero seconds/ms and assert it's coarsened:

```ts
  // in the row factory: createdAt: new Date('2026-07-03T12:00:37.512Z')
  // in the assertion:
  expect(body[0].createdAt).toBe('2026-07-03T12:00:00.000Z') // seconds/ms zeroed
```

- [ ] **Step 2: Run to verify failure**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project unit server/sightings/routes.test.ts`
Expected: FAIL — response returns `…T12:00:37.512Z` (unmodified).

- [ ] **Step 3: Add the projection to the GET handler**

In `app/server/sightings/routes.ts`, add a helper near the top of the file (after imports) and apply it in the GET response:

```ts
/** Public projection: coarsen the insert timestamp to the minute so the public
 *  API doesn't leak a sub-minute "active right now" signal (no finer than the
 *  already-public sighting time). The DB/RSS keep full precision. */
function toPublicSighting(s: Sighting): Sighting {
  const createdAt = new Date(s.createdAt)
  createdAt.setSeconds(0, 0)
  return { ...s, createdAt }
}
```

Change the GET response line from `res.json(await store.list({ from, to }))` to:

```ts
    res.json((await store.list({ from, to })).map(toPublicSighting))
```

- [ ] **Step 4: Run to verify pass**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project unit server/sightings/routes.test.ts`
Expected: PASS. Also check the integration test still passes if present:
`NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project integration server/sightings/api.integration.test.ts` (its POST-then-GET should still round-trip; adjust any exact-`createdAt` assertion to minute precision).

- [ ] **Step 5: Commit**

Run: `pnpm lint && pnpm typecheck`

```bash
git add server/sightings/routes.ts server/sightings/routes.test.ts server/sightings/api.integration.test.ts
git commit -m "feat: coarsen createdAt to the minute in the public sightings API"
```

---

### Task 3: public-safety warning in the log form

**Files:**
- Modify: `app/src/components/DetailsForm.tsx`, `app/src/index.css`
- Test: `app/src/components/DetailsForm.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `app/src/components/DetailsForm.test.tsx`:

```ts
  it('warns that the place field is public', () => {
    render(<DetailsForm emoji="🦊" initialName="Fox" onBack={() => {}} onSave={() => {}} saving={false} />)
    expect(screen.getByText(/public/i)).toBeInTheDocument()
    expect(screen.getByText(/home address or exact/i)).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run to verify failure**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client src/components/DetailsForm.test.tsx`
Expected: FAIL — no such text.

- [ ] **Step 3: Add the hint under the place field**

In `app/src/components/DetailsForm.tsx`, the "Where?" label:

```tsx
      <label className="field">
        Where?
        <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Where? (backyard, trail...)" />
        <span className="field-hint">Public — skip your home address or exact current location.</span>
      </label>
```

Append to `app/src/index.css`:

```css
.field-hint {
  font-size: 11px;
  color: var(--ink-secondary);
  margin-top: 4px;
}
```

- [ ] **Step 4: Run to verify pass, then full check**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client src/components/DetailsForm.test.tsx && pnpm lint && pnpm typecheck`
Expected: PASS/green.

- [ ] **Step 5: Commit**

```bash
git add src/components/DetailsForm.tsx src/components/DetailsForm.test.tsx src/index.css
git commit -m "feat: warn that the sighting place field is public"
```

---

### Task 4: helmet + CSP + security headers + disable x-powered-by

**Files:**
- Modify: `app/server/app.ts`, `app/package.json` (dep)
- Test: `app/server/app.test.ts`

**Interfaces:**
- Produces: every response carries CSP, HSTS, `Referrer-Policy`, `Permissions-Policy`, `X-Content-Type-Options`, and no `X-Powered-By`.

- [ ] **Step 1: Add the dependency**

Run (from `app/`): `pnpm add helmet`
Expected: `helmet` added to `package.json` dependencies; lockfile updated.

- [ ] **Step 2: Write the failing headers test**

Append to `app/server/app.test.ts`:

```ts
describe('security headers', () => {
  it('sets CSP, HSTS, referrer/permissions policies, nosniff, and no x-powered-by', async () => {
    await withServer(createApp(deps()), async (base) => {
      const res = await fetch(`${base}/api/health`)
      const csp = res.headers.get('content-security-policy') ?? ''
      expect(csp).toContain("default-src 'self'")
      expect(csp).toContain("frame-ancestors 'none'")
      expect(csp).toContain('https://fonts.gstatic.com')
      expect(res.headers.get('strict-transport-security')).toBeTruthy()
      expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
      expect(res.headers.get('permissions-policy') ?? '').toContain('geolocation=()')
      expect(res.headers.get('x-content-type-options')).toBe('nosniff')
      expect(res.headers.get('x-powered-by')).toBeNull()
    })
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project unit server/app.test.ts`
Expected: FAIL — headers absent, x-powered-by present.

- [ ] **Step 4: Wire helmet into `createApp`**

In `app/server/app.ts`, add the import and, at the very start of `createApp` (before `express.json()`), disable the fingerprint header and install helmet + the Permissions-Policy:

```ts
import helmet from 'helmet'
```

```ts
export function createApp(deps: AppDeps): Express {
  const app = express()
  app.disable('x-powered-by')
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          manifestSrc: ["'self'"],
          workerSrc: ["'self'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          objectSrc: ["'none'"],
        },
      },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  )
  app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    next()
  })
  app.use(express.json())
```

(`'unsafe-inline'` on `style-src` is required by React inline `style` attributes; helmet sets HSTS + `nosniff` + `X-Frame-Options` by default.)

- [ ] **Step 5: Run to verify pass, then full check**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project unit server/app.test.ts && pnpm lint && pnpm typecheck && pnpm build`
Expected: PASS/green.

**Visual/DoD gate (real browser):** run the app (`docker compose up -d --build`) and load it in Chrome; confirm the console shows **zero CSP violations** and that the Google Fonts and the service worker load. If a violation appears (e.g. an unforeseen inline script), note it and widen the specific directive minimally.

- [ ] **Step 6: Commit**

```bash
git add server/app.ts package.json pnpm-lock.yaml
git commit -m "feat: add helmet CSP + security headers, disable x-powered-by"
```

---

### Task 5: rate limiting (write-auth, mutations, push-subscribe)

**Files:**
- Modify: `app/server/app.ts`, `app/package.json` (dep)
- Test: `app/server/app.test.ts`

**Interfaces:**
- Consumes: `AppDeps`. Adds an optional `rateLimits?: { authPerMin: number; mutationPerMin: number }` to `AppDeps` (defaults below) so tests can set a tiny limit.

- [ ] **Step 1: Add the dependency**

Run (from `app/`): `pnpm add express-rate-limit`

- [ ] **Step 2: Write the failing rate-limit test**

Append to `app/server/app.test.ts`:

```ts
describe('rate limiting', () => {
  it('429s mutations past the limit, keyed per client IP', async () => {
    const app = createApp(deps({ rateLimits: { authPerMin: 100, mutationPerMin: 2 } }))
    await withServer(app, async (base) => {
      const post = () =>
        fetch(`${base}/api/push/subscriptions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.9' },
          body: JSON.stringify({}),
        })
      const a = await post()
      const b = await post()
      const c = await post()
      expect(c.status).toBe(429) // third mutation from the same IP is limited
      expect(a.status).not.toBe(429)
      expect(b.status).not.toBe(429)
    })
  })

  it('does not rate-limit GET reads', async () => {
    const app = createApp(deps({ rateLimits: { authPerMin: 100, mutationPerMin: 2 } }))
    await withServer(app, async (base) => {
      for (let i = 0; i < 5; i++) expect((await fetch(`${base}/api/sightings`)).status).toBe(200)
    })
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project unit server/app.test.ts`
Expected: FAIL — no 429 / `rateLimits` not on `AppDeps`.

- [ ] **Step 4: Implement the limiters**

In `app/server/app.ts`:

Add to the `AppDeps` interface:

```ts
  /** Rate-limit ceilings per minute per client IP. Defaults applied in createApp. */
  rateLimits?: { authPerMin: number; mutationPerMin: number }
```

Add the import:

```ts
import rateLimit from 'express-rate-limit'
```

After the Permissions-Policy middleware and before `express.json()` (or right after it — must be before the routers), add:

```ts
  const limits = deps.rateLimits ?? { authPerMin: 10, mutationPerMin: 30 }
  // Origin is tunnel-only, so CF-Connecting-IP (set by Cloudflare) is trustworthy;
  // fall back to req.ip for local/dev.
  const clientKey = (req: express.Request): string => {
    const cf = req.headers['cf-connecting-ip']
    return (typeof cf === 'string' ? cf : req.ip) ?? 'unknown'
  }
  const validate = { trustProxy: false, xForwardedForHeader: false }
  const mutationLimiter = rateLimit({
    windowMs: 60_000,
    limit: limits.mutationPerMin,
    keyGenerator: clientKey,
    skip: (req) => req.method === 'GET', // public reads/feed unaffected
    standardHeaders: true,
    legacyHeaders: false,
    validate,
  })
  const authLimiter = rateLimit({
    windowMs: 60_000,
    limit: limits.authPerMin,
    keyGenerator: clientKey,
    standardHeaders: true,
    legacyHeaders: false,
    validate,
  })
  app.use(mutationLimiter)
```

Apply `authLimiter` to the auth-check route. Find `app.get('/api/auth/check', writeGate, …)` and insert the limiter before `writeGate`:

```ts
  app.get('/api/auth/check', authLimiter, writeGate, (_req, res) => {
    res.status(204).end()
  })
```

(`mutationLimiter` runs `app.use`-globally but `skip`s GET, so it only counts POST/PUT/DELETE — all writes plus push subscribe/unsubscribe. `/api/auth/check` is a GET, so it's covered by `authLimiter` specifically.)

- [ ] **Step 5: Run to verify pass, then full check**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project unit server/app.test.ts && pnpm lint && pnpm typecheck`
Expected: PASS/green.

- [ ] **Step 6: Commit**

```bash
git add server/app.ts package.json pnpm-lock.yaml
git commit -m "feat: rate-limit write auth, mutations, and push subscribe (per CF-Connecting-IP)"
```

---

### Task 6: push SSRF allowlist

**Files:**
- Modify: `app/server/push/routes.ts`
- Test: `app/server/push/routes.test.ts`

**Interfaces:**
- Tightens `parseSubscription`: an `endpoint` whose host is not a known push service is rejected (400).

- [ ] **Step 1: Write the failing test**

Append to `app/server/push/routes.test.ts` (mirror its existing subscribe harness — POST `/api/push/subscriptions` with a valid `keys` object):

```ts
  it('accepts real push-service endpoints and rejects others', async () => {
    const ok = 'https://fcm.googleapis.com/fcm/send/abc123'
    const wns = 'https://db5p.notify.windows.com/w/?token=xyz'
    const evil = 'https://192.168.1.10/steal'
    const other = 'https://evil.example.com/push'
    // helper `subscribe(base, endpoint)` posts a valid body with that endpoint; mirror existing tests.
    await withServer(appForPush(), async (base) => {
      expect((await subscribe(base, ok)).status).toBe(201)
      expect((await subscribe(base, wns)).status).toBe(201)
      expect((await subscribe(base, evil)).status).toBe(400)
      expect((await subscribe(base, other)).status).toBe(400)
    })
  })
```

- [ ] **Step 2: Run to verify failure**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project unit server/push/routes.test.ts`
Expected: FAIL — `evil`/`other` currently accepted (201).

- [ ] **Step 3: Implement the allowlist**

In `app/server/push/routes.ts`, replace `isHttpsUrl` with an allowlist check:

```ts
// Known Web Push service hosts (Chrome/Android, Firefox, Edge/Windows, Safari).
const PUSH_EXACT = new Set(['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'])
const PUSH_SUFFIXES = ['.notify.windows.com', '.push.apple.com']

function isAllowedPushEndpoint(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  const host = url.hostname.toLowerCase()
  return PUSH_EXACT.has(host) || PUSH_SUFFIXES.some((s) => host.endsWith(s))
}
```

Update the endpoint validation in `parseSubscription` (the `!isHttpsUrl(endpoint)` check) to use it:

```ts
  if (typeof endpoint !== 'string' || endpoint.length > 1000 || !isAllowedPushEndpoint(endpoint)) {
    details.endpoint = 'required, must be a supported push-service https URL of at most 1000 characters'
  }
```

(Delete the now-unused `isHttpsUrl`.)

- [ ] **Step 4: Run to verify pass, then full check**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project unit server/push/routes.test.ts && pnpm lint && pnpm typecheck && pnpm build`
Expected: PASS/green. Fix any existing push test that used a non-allowlisted example endpoint (change it to `https://fcm.googleapis.com/…`).

- [ ] **Step 5: Commit**

```bash
git add server/push/routes.ts server/push/routes.test.ts
git commit -m "feat: allowlist push-service hosts to block SSRF via subscription endpoint"
```
