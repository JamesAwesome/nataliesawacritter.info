# Entry Auth Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "+ Log a sighting" asks for (and server-verifies) the magic word *before* showing the critter picker when no password is saved — so nobody builds a sighting they can't save. Per `docs/superpowers/specs/2026-07-05-entry-auth-gate-design.md`.

**Architecture:** A four-line `GET /api/auth/check` endpoint behind the existing `writeGate` (204/401/503 come free from existing middleware). `LogSightingFlow` gains an entry gate that renders the existing `PasswordPrompt` in place of the picker when `getCredentials()` is null, verifies on submit via `api.checkAuth`, stores on success. Save-time auth machinery (`useWriteAction`) is untouched as the backstop.

**Tech Stack:** Express 5, React 19, Vitest 4. **No new dependencies.**

**Spec:** `docs/superpowers/specs/2026-07-05-entry-auth-gate-design.md`

## Global Constraints

- pnpm from `app/`; raw vitest needs `NODE_OPTIONS=--no-experimental-webstorage` prefix; server imports use `.js` extensions.
- Copy exact: prompt heading stays `Natalie, what's the magic word?` (unchanged component); gate errors `Wrong password — try again` (401), `Couldn't check the password — try again` (other); 503 flow line `Logging is disabled right now`.
- `GET /api/auth/check` → 204 valid auth / 401 wrong-or-missing / 503 writes disabled. No new router file.
- Save-time prompt/401 machinery in `useWriteAction` and all delete/photo/friend gates: byte-untouched.
- Stored-credentials open: picker immediately, ZERO network requests.
- Existing `LogSightingFlow.test.tsx` tests: preserved via the harness change in Task 3 (renderFlow seeds credentials by default); a test whose premise the gate makes impossible (reaching the details step with no stored credentials) is REPLACED with gate coverage, never deleted without replacement.

---

### Task 1: `GET /api/auth/check` endpoint

**Files:**
- Modify: `app/server/app.ts` (after the `writeGate` definition, before the router mounts)
- Test: `app/server/app.test.ts` (append)

**Interfaces:**
- Produces: `GET /api/auth/check` — 204 on valid basic auth, 401 on wrong/missing (from `requireWriteAuth`), 503 `{ error: 'writes disabled' }` when `writeCredentials` is null. Task 2's client function calls it.

- [ ] **Step 1: Write the failing test**

Append to `app/server/app.test.ts`:

```ts
describe('GET /api/auth/check', () => {
  it('204s with valid credentials, 401s with wrong or missing', async () => {
    const app = createApp(deps({ writeCredentials: { user: 'natalie', password: 'sekrit' } }))
    await withServer(app, async (base) => {
      const ok = await fetch(`${base}/api/auth/check`, {
        headers: { authorization: basic('natalie', 'sekrit') },
      })
      expect(ok.status).toBe(204)
      const wrong = await fetch(`${base}/api/auth/check`, {
        headers: { authorization: basic('natalie', 'nope') },
      })
      expect(wrong.status).toBe(401)
      expect((await fetch(`${base}/api/auth/check`)).status).toBe(401)
    })
  })

  it('503s when writes are disabled', async () => {
    await withServer(createApp(deps()), async (base) => {
      const res = await fetch(`${base}/api/auth/check`)
      expect(res.status).toBe(503)
      expect(await res.json()).toEqual({ error: 'writes disabled' })
    })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run (from `app/`): `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project unit server/app.test.ts`
Expected: the two new tests FAIL with 404 (route doesn't exist); all pre-existing tests pass.

- [ ] **Step 3: Implement**

In `app/server/app.ts`, directly after the `const writeGate = ...` block:

```ts
  // Entry gate for the logging flow: lets the client verify the magic word
  // before showing the picker. Semantics come entirely from writeGate.
  app.get('/api/auth/check', writeGate, (_req, res) => {
    res.status(204).end()
  })
```

- [ ] **Step 4: Run to verify pass**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project unit server/app.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add server/app.ts server/app.test.ts
git commit -m "feat: auth-check endpoint behind the write gate"
```

---

### Task 2: client `checkAuth` + PasswordPrompt busy prop

**Files:**
- Modify: `app/src/api.ts` (append), `app/src/components/PasswordPrompt.tsx`
- Test: `app/src/api.test.ts` (append)

**Interfaces:**
- Consumes: Task 1's endpoint; existing `ApiError`.
- Produces: `checkAuth(authHeader: string): Promise<void>` (throws `ApiError(status)` on non-ok). `PasswordPrompt` gains optional `busy?: boolean` (default false) disabling the Save button — existing callers unchanged. Task 3 consumes both.

- [ ] **Step 1: Write the failing api test**

Append to `app/src/api.test.ts` (extend the existing `./api` import line with `checkAuth`):

```ts
describe('checkAuth', () => {
  it('GETs the check endpoint with the auth header and resolves on 204', async () => {
    const mock = stubFetchQueue([{ status: 204, body: null }])
    await expect(checkAuth('Basic abc')).resolves.toBeUndefined()
    expect(mock).toHaveBeenCalledWith('/api/auth/check', {
      headers: { authorization: 'Basic abc' },
    })
  })

  it('throws ApiError with the status on 401 and 503', async () => {
    stubFetchQueue([{ status: 401, body: { error: 'unauthorized' } }])
    await expect(checkAuth('Basic bad')).rejects.toMatchObject({ status: 401 })
    stubFetchQueue([{ status: 503, body: { error: 'writes disabled' } }])
    await expect(checkAuth('Basic abc')).rejects.toMatchObject({ status: 503 })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client src/api.test.ts`
Expected: FAIL — `checkAuth` is not exported.

- [ ] **Step 3: Implement**

Append to `app/src/api.ts`:

```ts
export async function checkAuth(authHeader: string): Promise<void> {
  const res = await fetch('/api/auth/check', {
    headers: { authorization: authHeader },
  })
  if (!res.ok) throw new ApiError(res.status)
}
```

In `app/src/components/PasswordPrompt.tsx`, add the optional prop and wire it to the Save button (Cancel stays enabled so the user can always bail):

```tsx
type Props = {
  open: boolean
  error: string | null
  onSubmit: (password: string) => void
  onCancel: () => void
  busy?: boolean
}

export function PasswordPrompt({ open, error, onSubmit, onCancel, busy = false }: Props) {
```

and on the Save button:

```tsx
        <button type="button" className="btn-primary" disabled={busy} onClick={() => onSubmit(password)}>
          Save
        </button>
```

- [ ] **Step 4: Run to verify pass**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client src/api.test.ts src/components/LogSightingFlow.test.tsx src/components/SightingDetail.test.tsx`
Expected: all PASS (busy is optional, existing PasswordPrompt callers unaffected).

- [ ] **Step 5: Commit**

```bash
git add src/api.ts src/api.test.ts src/components/PasswordPrompt.tsx
git commit -m "feat: checkAuth api function and PasswordPrompt busy prop"
```

---

### Task 3: entry gate in LogSightingFlow

**Files:**
- Modify: `app/src/components/LogSightingFlow.tsx`
- Test: `app/src/components/LogSightingFlow.test.tsx` (harness change + appended describe block)

**Interfaces:**
- Consumes: `checkAuth` and `PasswordPrompt.busy` (Task 2); `getCredentials`/`setCredentials`/`basicHeader` from `src/auth`; existing `ApiError`.
- Produces: user-facing behavior only; no new exports.

- [ ] **Step 1: Adjust the test harness (existing tests keep passing by taking the skip path)**

In `app/src/components/LogSightingFlow.test.tsx`, `renderFlow` gains an opt-out credentials seed — existing call sites unchanged:

```tsx
function renderFlow(
  overrides: Partial<Parameters<typeof LogSightingFlow>[0]> = {},
  opts: { credentials?: boolean } = {},
) {
  if (opts.credentials !== false) setCredentials('sekrit')
  const onSave = overrides.onSave ?? vi.fn(async (_f: NewSightingInput, _h: string) => {})
  const onLogged = overrides.onLogged ?? vi.fn()
  const onClose = overrides.onClose ?? vi.fn()
  render(
    <LogSightingFlow open onClose={onClose} onSave={onSave} onLogged={onLogged} {...overrides} />,
  )
  return { onSave, onLogged, onClose }
}
```

Check the file for any existing test that renders WITHOUT credentials and exercises the save-time no-credentials prompt (search for a test reaching Save with no `setCredentials` call). The gate makes that state unreachable — REPLACE such a test's premise with the gate coverage below (the stale-credentials 401 save tests, which DO call `setCredentials`, keep working and stay untouched).

- [ ] **Step 2: Write the failing gate tests**

Append to `app/src/components/LogSightingFlow.test.tsx` (add `getCredentials` to the `../auth` import and `stubFetchQueue` to the `../test/helpers` import):

```tsx
describe('entry auth gate', () => {
  it('shows the magic-word prompt instead of the picker when no password is saved', () => {
    renderFlow({}, { credentials: false })
    expect(screen.getByText("Natalie, what's the magic word?")).toBeInTheDocument()
    expect(screen.queryByText('What did Natalie see?')).not.toBeInTheDocument()
  })

  it('verifies, stores the password, and reveals the picker on success', async () => {
    const mock = stubFetchQueue([{ status: 204, body: null }])
    renderFlow({}, { credentials: false })
    await userEvent.type(screen.getByLabelText(/password/i), 'sekrit')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('What did Natalie see?')).toBeInTheDocument()
    expect(getCredentials()).toEqual({ user: 'natalie', password: 'sekrit' })
    expect(mock).toHaveBeenCalledWith('/api/auth/check', {
      headers: { authorization: expect.stringMatching(/^Basic /) },
    })
  })

  it('shows the wrong-password error on 401 and stays locked', async () => {
    stubFetchQueue([{ status: 401, body: { error: 'unauthorized' } }])
    renderFlow({}, { credentials: false })
    await userEvent.type(screen.getByLabelText(/password/i), 'nope')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Wrong password — try again')).toBeInTheDocument()
    expect(screen.queryByText('What did Natalie see?')).not.toBeInTheDocument()
    expect(getCredentials()).toBeNull()
  })

  it('shows the disabled line on 503', async () => {
    stubFetchQueue([{ status: 503, body: { error: 'writes disabled' } }])
    renderFlow({}, { credentials: false })
    await userEvent.type(screen.getByLabelText(/password/i), 'sekrit')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Logging is disabled right now')).toBeInTheDocument()
    expect(screen.queryByText("Natalie, what's the magic word?")).not.toBeInTheDocument()
  })

  it('shows the check-failed copy on other errors', async () => {
    stubFetchQueue([{ status: 500, body: { error: 'internal' } }])
    renderFlow({}, { credentials: false })
    await userEvent.type(screen.getByLabelText(/password/i), 'sekrit')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText("Couldn't check the password — try again")).toBeInTheDocument()
  })

  it('cancel closes the sheet', async () => {
    const { onClose } = renderFlow({}, { credentials: false })
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('opens straight to the picker with stored credentials and no network', () => {
    const mock = stubFetchQueue([])
    renderFlow()
    expect(screen.getByText('What did Natalie see?')).toBeInTheDocument()
    expect(mock).not.toHaveBeenCalled()
  })
})
```

Also add `vi.unstubAllGlobals()` to the file's `afterEach` (it currently only clears localStorage) so the fetch stubs don't leak between tests.

- [ ] **Step 3: Run to verify failure**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client src/components/LogSightingFlow.test.tsx`
Expected: the new gate tests FAIL (picker renders instead of the prompt); pre-existing tests PASS (harness seeds credentials).

- [ ] **Step 4: Implement the gate**

In `app/src/components/LogSightingFlow.tsx`:

Add imports: `checkAuth` and `ApiError` to the `../api` import; `import { basicHeader, getCredentials, setCredentials } from '../auth'`.

Add gate state next to `picked` (inside the component):

```tsx
  const [unlocked, setUnlocked] = useState(false)
  const [gateBusy, setGateBusy] = useState(false)
  const [gateError, setGateError] = useState<string | null>(null)
  const [gateDisabled, setGateDisabled] = useState(false)
  // Evaluated fresh each render: stored credentials skip the gate entirely.
  const locked = !unlocked && getCredentials() === null
```

Add the unlock handler:

```tsx
  async function unlock(password: string) {
    setGateBusy(true)
    setGateError(null)
    try {
      await checkAuth(basicHeader({ user: 'natalie', password }))
      setCredentials(password)
      setUnlocked(true)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setGateError('Wrong password — try again')
      } else if (err instanceof ApiError && err.status === 503) {
        setGateDisabled(true)
      } else {
        setGateError("Couldn't check the password — try again")
      }
    } finally {
      setGateBusy(false)
    }
  }
```

Reset gate state in `close()` (so reopening re-evaluates):

```tsx
  function close() {
    write.abandon()
    setPicked(null)
    setUnlocked(false)
    setGateBusy(false)
    setGateError(null)
    setGateDisabled(false)
    onClose()
  }
```

Wrap the sheet body — the gate renders in place of the picker/details branches:

```tsx
    <Sheet open={open} onClose={close}>
      {locked ? (
        gateDisabled ? (
          <p className="flow-error" data-testid="flow-error">
            Logging is disabled right now
          </p>
        ) : (
          <PasswordPrompt
            open
            error={gateError}
            busy={gateBusy}
            onCancel={close}
            onSubmit={(password) => void unlock(password)}
          />
        )
      ) : picked === null ? (
        /* existing EmojiPicker branch, unchanged */
      ) : (
        /* existing details branch, unchanged */
      )}
    </Sheet>
```

(The existing picker and details JSX move inside this conditional byte-unchanged; the save-time `write.prompt` overlay in the details branch stays exactly as-is.)

- [ ] **Step 5: Run to verify pass, then the full gates**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client src/components/LogSightingFlow.test.tsx`
Expected: all PASS.

Then: `pnpm test && pnpm lint && pnpm typecheck`
Expected: everything green (integration needs Docker).

- [ ] **Step 6: Commit**

```bash
git add src/components/LogSightingFlow.tsx src/components/LogSightingFlow.test.tsx
git commit -m "feat: server-verified magic-word gate before the critter picker"
```
