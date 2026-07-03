# Calendar Cycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The calendar tab renders sightings on a month grid with Day Detail and Sighting Detail sheets (two-tap delete), per `docs/superpowers/specs/2026-07-03-calendar-cycle-design.md`.

**Architecture:** Pure month math in `lib/calendar.ts`; thin components. The 401/prompt machinery extracts from LogSightingFlow into a shared `useWriteAction` hook (log flow's tests must pass unchanged); Sighting Detail's delete is its second consumer. App's sheet state becomes a small route object. Cycle opens with the queued hygiene commit (shared test helpers, reduced-motion, pointerdown scrim, tabs ARIA).

**Tech Stack:** React 19, TypeScript 6, Vitest 4 + Testing Library (jsdom). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-03-calendar-cycle-design.md`
**Design source:** `docs/design/README.md` §2 / §6 / §7

## Global Constraints

- pnpm 11.9.0 only, from `app/`. Raw vitest invocations REQUIRE the flag: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client` (the pnpm test scripts already carry it).
- Components use CSS custom properties; no raw hexes in TSX.
- **LogSightingFlow's existing test file must pass UNCHANGED by the refactor task** (the file is not edited except, if unavoidable, import paths).
- Copy exact: month label "July 2026" style; weekday row S M T W T F S; day-cell "+N" overflow; Day Detail heading "Mon D"; delete confirm label "Really delete?"; delete messages "Deleting is disabled right now" / "Couldn't delete — try again".
- Delete contract: 204 success; 404 treated as success (row gone either way); 401 → prompt; 503/network → inline error, row untouched.
- Dates are `YYYY-MM-DD` strings; never parse them with `new Date(string)` (UTC shift) — construct via `new Date(year, monthIndex, day)`.
- Working directory: the repo (or its worktree copy); paths repo-relative.

---

### Task 1: Hygiene opener — shared test helpers, reduced-motion, pointerdown scrim, tabs ARIA

**Files:**
- Create: `app/src/test/helpers.tsx`
- Modify: `app/src/api.test.ts`, `app/src/App.test.tsx`, `app/src/hooks/useSightings.test.ts`, `app/src/components/RecentCritters.test.tsx`, `app/src/components/LogSightingFlow.test.tsx`, `app/src/hooks/useIsDesktop.test.ts` (adopt helpers), `app/src/components/Sheet.tsx` + `Sheet.test.tsx` (pointerdown scrim), `app/src/components/Tabs.tsx` + `app/src/App.tsx` (ARIA + drop redundant wrapper), `app/src/index.css` (reduced-motion)

**Interfaces:**
- Produces (later tasks' tests use these):

```ts
// app/src/test/helpers.tsx
export function makeSighting(overrides?: Partial<Sighting>): Sighting  // stable defaults, unique id per call
export function stubFetchQueue(responses: Array<{ status: number; body: unknown }>): Mock  // queue-based global fetch stub
export function stubMatchMedia(matches: boolean): { fireChange(matches: boolean): void }
export const FIXED_NOW = '2026-07-03T15:00:00'
export function useFakeClock(): void  // registers beforeEach(fake timers @ FIXED_NOW) + afterEach(real timers)
```

- [ ] **Step 1: Create the shared helpers**

`app/src/test/helpers.tsx`:

```tsx
import { vi, beforeEach, afterEach, type Mock } from 'vitest'
import type { Sighting } from '../api'

let counter = 0

export function makeSighting(overrides: Partial<Sighting> = {}): Sighting {
  counter += 1
  return {
    id: `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
    emoji: '🦊',
    name: 'Fox',
    sightedOn: '2026-07-02',
    sightedTime: null,
    place: null,
    comment: null,
    photoPath: null,
    createdAt: '2026-07-02T12:00:00.000Z',
    ...overrides,
  }
}

export function stubFetchQueue(responses: Array<{ status: number; body: unknown }>): Mock {
  const queue = [...responses]
  const mock = vi.fn(async () => {
    const next = queue.shift() ?? { status: 500, body: { error: 'internal' } }
    return new Response(JSON.stringify(next.body), { status: next.status })
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

export function stubMatchMedia(matches: boolean): { fireChange(matches: boolean): void } {
  let current = matches
  const listeners = new Set<(e: { matches: boolean }) => void>()
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: current,
    media: query,
    addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: (e: { matches: boolean }) => void) => listeners.delete(fn),
  })))
  return {
    fireChange(next: boolean) {
      current = next
      for (const fn of listeners) fn({ matches: next })
    },
  }
}

export const FIXED_NOW = '2026-07-03T15:00:00'

export function useFakeClock(): void {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(FIXED_NOW))
  })
  afterEach(() => {
    vi.useRealTimers()
  })
}
```

- [ ] **Step 2: Adopt the helpers in the six existing test files**

Mechanical replacement, no assertion changes:
- Replace each local `ROW` literal / `row()` builder with `makeSighting(...)` calls preserving the same field values each test relied on (e.g. `makeSighting({ id: '3f9a26cc-…', sightedOn: '2026-07-03', createdAt: '2026-07-03T12:00:00.000Z' })` where the old ROW had those). Where a test asserted a specific id, pass that id explicitly.
- Replace `stubFetchOnce`/`stubFetchQueue` local definitions with the shared `stubFetchQueue` import (api.test.ts's single-response `stubFetch(status, body)` becomes `stubFetchQueue([{ status, body }])`).
- Replace the two inline fake-timer beforeEach/afterEach blocks with `useFakeClock()` called at describe top-level.
- Replace App.test.tsx's inline matchMedia stub and useIsDesktop.test.ts's local `stubMatchMedia` with the shared one (keep assertions; useIsDesktop's change-event test uses `fireChange`).

Run after each file: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client` — same pass counts as before (112 total across the suite; client 60).

- [ ] **Step 3: Pointerdown-based scrim dismissal**

`app/src/components/Sheet.tsx` — replace the scrim div's handler wiring:

```tsx
  const pressStartedOnScrim = useRef(false)
```

```tsx
    <div
      className="sheet-scrim"
      data-testid="sheet-scrim"
      onPointerDown={(e) => {
        pressStartedOnScrim.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        if (pressStartedOnScrim.current && e.target === e.currentTarget) onClose()
      }}
    >
```

(add `useRef` to the react import). Append one test to `Sheet.test.tsx`:

```tsx
  it('does not close when a press starts inside the content and ends on the scrim', () => {
    const onClose = vi.fn()
    render(<Sheet open onClose={onClose}><p>content</p></Sheet>)
    fireEvent.pointerDown(screen.getByText('content'))
    fireEvent.click(screen.getByTestId('sheet-scrim'))
    expect(onClose).not.toHaveBeenCalled()
  })
```

(import `fireEvent`; the existing scrim-click test still passes because userEvent.click fires pointerdown on the scrim first).

- [ ] **Step 4: Tabs ARIA + drop the redundant wrapper**

`app/src/components/Tabs.tsx`: each tab button gains `aria-controls={'pane-' + t.id}`. `app/src/App.tsx`: wrap the pane area in `<div role="tabpanel" id={'pane-' + activeTab}>` (around the PlaceholderPane / future calendar slot), and remove the now-redundant `<div className="mobile-only">` wrapper around the mobile RecentCritters block (keep the `!isDesktop` gate; keep the wrapper around the log button).

- [ ] **Step 5: Reduced motion**

Append to `app/src/index.css`:

```css
@media (prefers-reduced-motion: reduce) {
  .sheet {
    animation: none;
  }
}
```

- [ ] **Step 6: Full gate + commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add app/src
git commit -m "test: shared client test helpers; fix scrim drag-dismiss, tabs aria, reduced motion"
```

Expected: same totals as before Task 1 plus the one new Sheet test (113).

---

### Task 2: lib/calendar.ts (pure month math, TDD)

**Files:**
- Create: `app/src/lib/calendar.ts`
- Test: `app/src/lib/calendar.test.ts`

**Interfaces:**
- Consumes: `Sighting` type from `../api`.
- Produces (Task 5 consumes exactly):

```ts
export type CalendarCell = {
  date: string; dayOfMonth: number; inMonth: boolean; isToday: boolean; sightings: Sighting[]
}
export function monthGrid(year: number, month: number, sightings: Sighting[], today: string): CalendarCell[]  // month 1-12; exactly 42 cells; weeks start Sunday
export function monthLabel(year: number, month: number): string          // "July 2026"
export function addMonths(year: number, month: number, delta: 1 | -1): { year: number; month: number }
export function currentYearMonth(): { year: number; month: number }      // from new Date() (fake-clock in tests)
export function todayString(): string                                    // local YYYY-MM-DD
```

- [ ] **Step 1: Write the failing tests**

`app/src/lib/calendar.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { makeSighting } from '../test/helpers'
import { addMonths, monthGrid, monthLabel } from './calendar'

describe('monthGrid', () => {
  it('returns 42 cells starting on the Sunday on or before the 1st', () => {
    // July 2026: the 1st is a Wednesday → grid starts Sun Jun 28
    const cells = monthGrid(2026, 7, [], '2026-07-03')
    expect(cells).toHaveLength(42)
    expect(cells[0]).toMatchObject({ date: '2026-06-28', inMonth: false, dayOfMonth: 28 })
    expect(cells[3]).toMatchObject({ date: '2026-07-01', inMonth: true, dayOfMonth: 1 })
    expect(cells[33]).toMatchObject({ date: '2026-07-31', inMonth: true })
    expect(cells[34]).toMatchObject({ date: '2026-08-01', inMonth: false })
  })

  it('marks today only when it falls in the grid', () => {
    const cells = monthGrid(2026, 7, [], '2026-07-03')
    expect(cells.filter((c) => c.isToday).map((c) => c.date)).toEqual(['2026-07-03'])
    expect(monthGrid(2026, 9, [], '2026-07-03').some((c) => c.isToday)).toBe(false)
  })

  it('handles leap February', () => {
    const cells = monthGrid(2028, 2, [], '2026-07-03')
    expect(cells.some((c) => c.date === '2028-02-29' && c.inMonth)).toBe(true)
    expect(cells.some((c) => c.date === '2028-02-30')).toBe(false)
  })

  it('handles a grid straddling a year boundary', () => {
    // Dec 2026: 1st is a Tuesday → starts Sun Nov 29; ends in Jan 2027
    const cells = monthGrid(2026, 12, [], '2026-07-03')
    expect(cells[0].date).toBe('2026-11-29')
    expect(cells[41].date).toBe('2027-01-09')
  })

  it('groups sightings onto their day preserving input order', () => {
    const a = makeSighting({ sightedOn: '2026-07-02', name: 'newer' })
    const b = makeSighting({ sightedOn: '2026-07-02', name: 'older' })
    const c = makeSighting({ sightedOn: '2026-07-04', name: 'solo' })
    const cells = monthGrid(2026, 7, [a, b, c], '2026-07-03')
    const day2 = cells.find((x) => x.date === '2026-07-02')!
    expect(day2.sightings.map((s) => s.name)).toEqual(['newer', 'older'])
    expect(cells.find((x) => x.date === '2026-07-04')!.sightings).toHaveLength(1)
    expect(cells.find((x) => x.date === '2026-07-05')!.sightings).toHaveLength(0)
  })
})

describe('monthLabel / addMonths', () => {
  it('formats the label', () => {
    expect(monthLabel(2026, 7)).toBe('July 2026')
    expect(monthLabel(2027, 1)).toBe('January 2027')
  })

  it('wraps across year boundaries', () => {
    expect(addMonths(2026, 12, 1)).toEqual({ year: 2027, month: 1 })
    expect(addMonths(2026, 1, -1)).toEqual({ year: 2025, month: 12 })
    expect(addMonths(2026, 6, 1)).toEqual({ year: 2026, month: 7 })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client`
Expected: FAIL — cannot resolve `./calendar`.

- [ ] **Step 3: Implement**

`app/src/lib/calendar.ts`:

```ts
import type { Sighting } from '../api'

export type CalendarCell = {
  date: string
  dayOfMonth: number
  inMonth: boolean
  isToday: boolean
  sightings: Sighting[]
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function toDateString(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

/** 42 cells (6 weeks) starting the Sunday on or before the 1st. month is 1-12. */
export function monthGrid(
  year: number,
  month: number,
  sightings: Sighting[],
  today: string,
): CalendarCell[] {
  const byDay = new Map<string, Sighting[]>()
  for (const s of sightings) {
    const list = byDay.get(s.sightedOn)
    if (list === undefined) byDay.set(s.sightedOn, [s])
    else list.push(s)
  }
  const first = new Date(year, month - 1, 1)
  const startOffset = first.getDay()
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(year, month - 1, 1 - startOffset + i)
    const date = toDateString(d)
    return {
      date,
      dayOfMonth: d.getDate(),
      inMonth: d.getMonth() === month - 1,
      isToday: date === today,
      sightings: byDay.get(date) ?? [],
    }
  })
}

export function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`
}

export function addMonths(year: number, month: number, delta: 1 | -1): { year: number; month: number } {
  const zeroBased = month - 1 + delta
  const newYear = year + Math.floor(zeroBased / 12)
  return { year: newYear, month: ((zeroBased % 12) + 12) % 12 + 1 }
}

export function currentYearMonth(): { year: number; month: number } {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

export function todayString(): string {
  return toDateString(new Date())
}
```

Also add to `app/src/lib/format.ts` (Task 6's Day Detail heading needs it):

```ts
/** "Jul 3" — same non-UTC-shifted parsing as formatWhen. */
export function formatDay(sightedOn: string): string {
  const [, month, day] = sightedOn.split('-').map(Number)
  return `${MONTHS[month - 1]} ${day}`
}
```

and refactor `formatWhen` to use it: `return \`${formatDay(sightedOn)} · ${sightedTime ?? 'just now'}\``. Add one test to `format.test.ts`: `expect(formatDay('2026-12-25')).toBe('Dec 25')`.

- [ ] **Step 4: Run to verify pass, lint/typecheck, commit**

```bash
NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client && pnpm lint && pnpm typecheck
git add app/src/lib
git commit -m "feat: pure calendar month math and formatDay"
```

---

### Task 3: deleteSighting (api) + removeSighting (hook), TDD

**Files:**
- Modify: `app/src/api.ts`, `app/src/hooks/useSightings.ts`
- Test: `app/src/api.test.ts`, `app/src/hooks/useSightings.test.ts` (append)

**Interfaces:**
- Produces:

```ts
// api.ts
export async function deleteSighting(id: string, authHeader: string): Promise<void>  // 204 resolves; non-2xx throws ApiError(status)
// useSightings return value gains:
removeSighting(id: string, authHeader: string): Promise<void>  // 204 or 404 → row removed from state, resolves; other errors rethrow, state untouched
```

- [ ] **Step 1: Append failing tests**

`app/src/api.test.ts`:

```ts
describe('deleteSighting', () => {
  it('DELETEs with the auth header and resolves on 204', async () => {
    const mock = stubFetchQueue([{ status: 204, body: null }])
    await expect(deleteSighting('abc-id', 'Basic xyz')).resolves.toBeUndefined()
    expect(mock).toHaveBeenCalledWith('/api/sightings/abc-id', {
      method: 'DELETE',
      headers: { authorization: 'Basic xyz' },
    })
  })

  it('throws ApiError with status on failure', async () => {
    stubFetchQueue([{ status: 401, body: { error: 'unauthorized' } }])
    await expect(deleteSighting('abc-id', 'Basic bad')).rejects.toMatchObject({ status: 401 })
  })
})
```

`app/src/hooks/useSightings.test.ts`:

```ts
  it('removeSighting deletes the row from state on 204', async () => {
    const row = makeSighting()
    stubFetchQueue([
      { status: 200, body: [row] },
      { status: 204, body: null },
    ])
    const { result } = renderHook(() => useSightings())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await act(() => result.current.removeSighting(row.id, 'Basic x'))
    expect(result.current.sightings).toEqual([])
  })

  it('removeSighting treats 404 as success', async () => {
    const row = makeSighting()
    stubFetchQueue([
      { status: 200, body: [row] },
      { status: 404, body: { error: 'not found' } },
    ])
    const { result } = renderHook(() => useSightings())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await act(() => result.current.removeSighting(row.id, 'Basic x'))
    expect(result.current.sightings).toEqual([])
  })

  it('removeSighting rethrows other errors without touching state', async () => {
    const row = makeSighting()
    stubFetchQueue([
      { status: 200, body: [row] },
      { status: 503, body: { error: 'writes disabled' } },
    ])
    const { result } = renderHook(() => useSightings())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await expect(
      act(() => result.current.removeSighting(row.id, 'Basic x')),
    ).rejects.toMatchObject({ status: 503 })
    expect(result.current.sightings).toEqual([row])
  })
```

- [ ] **Step 2: Run to verify failure**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client`
Expected: FAIL — `deleteSighting`/`removeSighting` don't exist.

- [ ] **Step 3: Implement**

Append to `app/src/api.ts`:

```ts
export async function deleteSighting(id: string, authHeader: string): Promise<void> {
  const res = await fetch(`/api/sightings/${id}`, {
    method: 'DELETE',
    headers: { authorization: authHeader },
  })
  if (!res.ok) throw new ApiError(res.status)
}
```

In `app/src/hooks/useSightings.ts` (import `deleteSighting`, `ApiError`; add to the returned object and the `SightingsState` type):

```ts
  const removeSighting = useCallback(async (id: string, authHeader: string) => {
    try {
      await deleteSighting(id, authHeader)
    } catch (err) {
      // 404 = already gone server-side; fall through to local removal
      if (!(err instanceof ApiError && err.status === 404)) throw err
    }
    setSightings((current) => current.filter((s) => s.id !== id))
  }, [])
```

- [ ] **Step 4: Run to verify pass, lint/typecheck, commit**

```bash
NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client && pnpm lint && pnpm typecheck
git add app/src/api.ts app/src/api.test.ts app/src/hooks/useSightings.ts app/src/hooks/useSightings.test.ts
git commit -m "feat: delete sighting api + hook removal with 404-as-success"
```

---

### Task 4: useWriteAction extraction (log-flow tests must pass unchanged)

**Files:**
- Create: `app/src/hooks/useWriteAction.ts`
- Test: `app/src/hooks/useWriteAction.test.tsx` (new, direct hook tests)
- Modify: `app/src/components/LogSightingFlow.tsx` (refactor onto the hook)
- DO NOT EDIT: `app/src/components/LogSightingFlow.test.tsx`

**Interfaces:**
- Produces (Task 6's SightingDetail consumes):

```ts
export type WriteMessages = { disabled: string; failed: string }
export function useWriteAction(messages: WriteMessages): {
  run(action: (authHeader: string) => Promise<void>, onSuccess: () => void): void
  busy: boolean
  actionError: string | null
  prompt: {
    open: boolean
    error: string | null
    onSubmit(password: string): void
    onCancel(): void
  }
  abandon(): void   // invalidates in-flight continuations, clears prompt/errors (owner calls on sheet close)
}
```

Behavior contract (mirrors today's LogSightingFlow exactly): re-entrancy guard while busy; missing credentials → prompt opens with the action pended; prompted password is STORED before the attempt; 401 → clearCredentials + re-prompt with "Wrong password — try again"; 503 → `messages.disabled`; other errors → `messages.failed`; success → `onSuccess()` (skipped if `abandon()` ran since the attempt started, as are all error-state updates).

- [ ] **Step 1: Implement the hook**

`app/src/hooks/useWriteAction.ts`:

```ts
import { useRef, useState } from 'react'
import { ApiError } from '../api'
import { basicHeader, clearCredentials, getCredentials, setCredentials } from '../auth'

export type WriteMessages = { disabled: string; failed: string }

type Pending = { action: (authHeader: string) => Promise<void>; onSuccess: () => void }

export function useWriteAction(messages: WriteMessages) {
  const [pending, setPending] = useState<Pending | null>(null)
  const [promptError, setPromptError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const sessionRef = useRef(0)

  async function attempt(request: Pending, password?: string) {
    if (busy) return
    const session = sessionRef.current
    const creds = password !== undefined ? { user: 'natalie', password } : getCredentials()
    if (creds === null) {
      setPending(request)
      return
    }
    setBusy(true)
    setActionError(null)
    if (password !== undefined) setCredentials(password)
    try {
      await request.action(basicHeader(creds))
      if (session !== sessionRef.current) return
      setBusy(false)
      request.onSuccess()
    } catch (err) {
      if (session !== sessionRef.current) return
      setBusy(false)
      if (err instanceof ApiError && err.status === 401) {
        clearCredentials()
        setPending(request)
        setPromptError('Wrong password — try again')
      } else if (err instanceof ApiError && err.status === 503) {
        setActionError(messages.disabled)
      } else {
        setActionError(messages.failed)
      }
    }
  }

  return {
    run(action: (authHeader: string) => Promise<void>, onSuccess: () => void) {
      void attempt({ action, onSuccess })
    },
    busy,
    actionError,
    prompt: {
      open: pending !== null,
      error: promptError,
      onSubmit(password: string) {
        if (pending === null) return
        const request = pending
        setPending(null)
        setPromptError(null)
        void attempt(request, password)
      },
      onCancel() {
        setPending(null)
        setPromptError(null)
      },
    },
    abandon() {
      sessionRef.current += 1
      setPending(null)
      setPromptError(null)
      setActionError(null)
      setBusy(false)
    },
  }
}
```

- [ ] **Step 2: Write direct hook tests**

`app/src/hooks/useWriteAction.test.tsx`:

```tsx
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api'
import { setCredentials } from '../auth'
import { useWriteAction } from './useWriteAction'

const MSG = { disabled: 'disabled msg', failed: 'failed msg' }

afterEach(() => {
  localStorage.clear()
})

describe('useWriteAction', () => {
  it('runs the action with the stored header and fires onSuccess', async () => {
    setCredentials('sekrit')
    const action = vi.fn(async (_h: string) => {})
    const onSuccess = vi.fn()
    const { result } = renderHook(() => useWriteAction(MSG))
    act(() => result.current.run(action, onSuccess))
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
    expect(action).toHaveBeenCalledWith('Basic ' + btoa('natalie:sekrit'))
    expect(result.current.busy).toBe(false)
  })

  it('opens the prompt when no credentials are stored, then runs on submit', async () => {
    const action = vi.fn(async () => {})
    const onSuccess = vi.fn()
    const { result } = renderHook(() => useWriteAction(MSG))
    act(() => result.current.run(action, onSuccess))
    expect(result.current.prompt.open).toBe(true)
    expect(action).not.toHaveBeenCalled()
    act(() => result.current.prompt.onSubmit('sekrit'))
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
    expect(localStorage.getItem('critter-write-auth')).not.toBeNull()
  })

  it('401 clears credentials and re-prompts with the error', async () => {
    setCredentials('wrong')
    const action = vi.fn(async () => {
      throw new ApiError(401)
    })
    const { result } = renderHook(() => useWriteAction(MSG))
    act(() => result.current.run(action, vi.fn()))
    await waitFor(() => expect(result.current.prompt.open).toBe(true))
    expect(result.current.prompt.error).toBe('Wrong password — try again')
    expect(localStorage.getItem('critter-write-auth')).toBeNull()
  })

  it('maps 503 and generic failures to the configured messages', async () => {
    setCredentials('sekrit')
    const { result } = renderHook(() => useWriteAction(MSG))
    act(() => result.current.run(async () => { throw new ApiError(503) }, vi.fn()))
    await waitFor(() => expect(result.current.actionError).toBe('disabled msg'))
    act(() => result.current.run(async () => { throw new TypeError('net') }, vi.fn()))
    await waitFor(() => expect(result.current.actionError).toBe('failed msg'))
  })

  it('abandon() suppresses a late success continuation', async () => {
    setCredentials('sekrit')
    let resolveAction!: () => void
    const onSuccess = vi.fn()
    const { result } = renderHook(() => useWriteAction(MSG))
    act(() => result.current.run(() => new Promise((res) => { resolveAction = res }), onSuccess))
    act(() => result.current.abandon())
    resolveAction()
    await act(async () => {})
    expect(onSuccess).not.toHaveBeenCalled()
    expect(result.current.actionError).toBeNull()
  })
})
```

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client` → new tests pass, everything else unchanged.

- [ ] **Step 3: Refactor LogSightingFlow onto the hook**

`app/src/components/LogSightingFlow.tsx` — full replacement:

```tsx
import { useState } from 'react'
import type { NewSightingInput } from '../api'
import { useWriteAction } from '../hooks/useWriteAction'
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
  const write = useWriteAction({
    disabled: 'Saving is disabled right now',
    failed: "Couldn't save — try again",
  })

  function close() {
    write.abandon()
    setPicked(null)
    onClose()
  }

  function save(fields: NewSightingInput) {
    write.run(
      (authHeader) => onSave(fields, authHeader),
      () => {
        setPicked(null)
        onLogged()
      },
    )
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
          {write.actionError !== null && <p className="flow-error">{write.actionError}</p>}
          <DetailsForm
            key={picked.emoji + (picked.name ?? '')}
            emoji={picked.emoji}
            initialName={picked.name}
            saving={write.busy}
            onBack={() => setPicked(null)}
            onSave={save}
          />
          {write.prompt.open && (
            <div className="prompt-overlay">
              <PasswordPrompt
                open
                error={write.prompt.error}
                onCancel={write.prompt.onCancel}
                onSubmit={write.prompt.onSubmit}
              />
            </div>
          )}
        </div>
      )}
    </Sheet>
  )
}
```

- [ ] **Step 4: Prove the refactor is behavior-preserving**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client`
Expected: ALL tests pass with `LogSightingFlow.test.tsx` UNTOUCHED (verify with `git status` — only the three files in this task's Files list changed). If any flow test fails, the hook's behavior diverges from the contract above — fix the HOOK, never the test.

- [ ] **Step 5: Lint, typecheck, full suite, commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add app/src/hooks/useWriteAction.ts app/src/hooks/useWriteAction.test.tsx app/src/components/LogSightingFlow.tsx
git commit -m "refactor: extract useWriteAction from the log flow (behavior-preserving)"
```

---

### Task 5: CalendarPane (grid + month navigation, TDD)

**Files:**
- Create: `app/src/components/CalendarPane.tsx`
- Modify: `app/src/index.css` (calendar styles + tokens `--calendar-strip`, `--out-of-month`)
- Test: `app/src/components/CalendarPane.test.tsx`

**Interfaces:**
- Consumes: `monthGrid`/`monthLabel`/`addMonths`/`currentYearMonth`/`todayString` (Task 2); `Sighting`.
- Produces: `CalendarPane: { sightings: Sighting[]; onDayOpen(date: string): void }` — Task 6 mounts it in App's calendar tabpanel.

- [ ] **Step 1: Write the failing tests**

`app/src/components/CalendarPane.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makeSighting, useFakeClock } from '../test/helpers'
import { CalendarPane } from './CalendarPane'

useFakeClock() // system time fixed at 2026-07-03

describe('CalendarPane', () => {
  it('renders the current month with weekday headers', () => {
    render(<CalendarPane sightings={[]} onDayOpen={() => {}} />)
    expect(screen.getByText('July 2026')).toBeInTheDocument()
    expect(screen.getAllByText('S')).toHaveLength(2) // Sun + Sat
  })

  it('navigates months across year boundaries', async () => {
    render(<CalendarPane sightings={[]} onDayOpen={() => {}} />)
    for (let i = 0; i < 7; i++) await userEvent.click(screen.getByRole('button', { name: /next month/i }))
    expect(screen.getByText('February 2027')).toBeInTheDocument()
    for (let i = 0; i < 8; i++) await userEvent.click(screen.getByRole('button', { name: /previous month/i }))
    expect(screen.getByText('June 2026')).toBeInTheDocument()
  })

  it('shows up to two emoji plus +N and makes only sighting days clickable', async () => {
    const onDayOpen = vi.fn()
    const day = '2026-07-02'
    const sightings = [
      makeSighting({ sightedOn: day, emoji: '🦌' }),
      makeSighting({ sightedOn: day, emoji: '🐦' }),
      makeSighting({ sightedOn: day, emoji: '🦊' }),
    ]
    render(<CalendarPane sightings={sightings} onDayOpen={onDayOpen} />)
    const cell = screen.getByRole('button', { name: /jul 2/i })
    expect(cell).toHaveTextContent('🦌🐦 +1')
    expect(cell).toHaveAccessibleName('Jul 2, 3 sightings')
    await userEvent.click(cell)
    expect(onDayOpen).toHaveBeenCalledWith(day)
    // a random empty day is not a button
    expect(screen.queryByRole('button', { name: /jul 9/i })).not.toBeInTheDocument()
  })

  it('marks today and dims out-of-month cells', () => {
    render(<CalendarPane sightings={[]} onDayOpen={() => {}} />)
    expect(document.querySelector('.day-cell.today')).not.toBeNull()
    expect(document.querySelectorAll('.day-cell.out-month').length).toBeGreaterThan(0)
  })
})
```

Clickable cells carry `aria-label` = `formatDay(date)` + count, e.g. `"Jul 2, 3 sightings"` (singular "sighting" when 1) — the test above matches this exactly.

- [ ] **Step 2: Run to verify failure**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

`app/src/components/CalendarPane.tsx`:

```tsx
import { useState } from 'react'
import type { Sighting } from '../api'
import { addMonths, currentYearMonth, monthGrid, monthLabel, todayString } from '../lib/calendar'
import { formatDay } from '../lib/format'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

type Props = {
  sightings: Sighting[]
  onDayOpen: (date: string) => void
}

export function CalendarPane({ sightings, onDayOpen }: Props) {
  const [visible, setVisible] = useState(currentYearMonth)
  const cells = monthGrid(visible.year, visible.month, sightings, todayString())

  return (
    <section className="card calendar-card">
      <div className="calendar-strip" aria-hidden="true" />
      <div className="calendar-head">
        <button
          type="button"
          className="month-nav"
          aria-label="Previous month"
          onClick={() => setVisible((v) => addMonths(v.year, v.month, -1))}
        >
          ‹
        </button>
        <h2>{monthLabel(visible.year, visible.month)}</h2>
        <button
          type="button"
          className="month-nav"
          aria-label="Next month"
          onClick={() => setVisible((v) => addMonths(v.year, v.month, 1))}
        >
          ›
        </button>
      </div>
      <div className="calendar-grid">
        {WEEKDAYS.map((d, i) => (
          <div key={i} className="weekday">
            {d}
          </div>
        ))}
        {cells.map((cell) => {
          const classes = [
            'day-cell',
            cell.inMonth ? '' : 'out-month',
            cell.isToday ? 'today' : '',
            cell.inMonth && cell.sightings.length > 0 ? 'has-sightings' : '',
          ]
            .filter(Boolean)
            .join(' ')
          const emoji = cell.sightings.slice(0, 2).map((s) => s.emoji).join('')
          const overflow = cell.sightings.length - 2
          const body = (
            <>
              <span className="day-num">{cell.dayOfMonth}</span>
              {cell.inMonth && cell.sightings.length > 0 && (
                <span className="day-emoji">
                  {emoji}
                  {overflow > 0 ? ` +${overflow}` : ''}
                </span>
              )}
            </>
          )
          if (cell.inMonth && cell.sightings.length > 0) {
            const count = cell.sightings.length
            return (
              <button
                key={cell.date}
                type="button"
                className={classes}
                aria-label={`${formatDay(cell.date)}, ${count} sighting${count === 1 ? '' : 's'}`}
                onClick={() => onDayOpen(cell.date)}
              >
                {body}
              </button>
            )
          }
          return (
            <div key={cell.date} className={classes}>
              {body}
            </div>
          )
        })}
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Append calendar CSS**

Add tokens to `:root` in `app/src/index.css`:

```css
  --calendar-strip: linear-gradient(90deg, #ffd6e8, #ffe9c7, #e8ffdb, #d3f0ff, #e6dbff);
  --out-of-month: #f5f8fc;
```

Append rules:

```css
.calendar-card {
  overflow: hidden;
}

.calendar-strip {
  height: 5px;
  background: var(--calendar-strip);
}

.calendar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px 8px;
}

.calendar-head h2 {
  margin: 0;
  font-family: 'Fredoka', sans-serif;
  font-weight: 600;
  font-size: 16px;
}

.month-nav {
  width: 30px;
  height: 30px;
  border-radius: 999px;
  border: 1px solid var(--border-hairline);
  background: var(--surface-input);
  color: var(--ink);
  font: inherit;
  cursor: pointer;
}

.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
  padding: 0 14px 14px;
}

.weekday {
  text-align: center;
  font-size: 11px;
  font-weight: 700;
  color: var(--ink-tertiary);
  padding: 4px 0;
}

.day-cell {
  aspect-ratio: 1;
  border-radius: 12px;
  border: 1px solid var(--border-hairline);
  background: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: 3px 0 0;
  font: inherit;
  overflow: hidden;
}

button.day-cell {
  cursor: pointer;
}

.day-cell.has-sightings {
  background: var(--surface-input);
}

.day-cell.today {
  border-color: var(--tab-calendar);
}

.day-cell.out-month {
  background: var(--out-of-month);
  opacity: 0.35;
}

.day-num {
  font-size: 10px;
  font-weight: 700;
  color: var(--ink-secondary);
}

.day-emoji {
  font-size: 12px;
  line-height: 1.4;
  white-space: nowrap;
}
```

- [ ] **Step 5: Run to verify pass, lint/typecheck, commit**

```bash
NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client && pnpm lint && pnpm typecheck
git add app/src/components/CalendarPane.tsx app/src/components/CalendarPane.test.tsx app/src/index.css
git commit -m "feat: calendar month grid with navigation per design handoff"
```

---

### Task 6: Day Detail + Sighting Detail sheets, sheet routing, tappable Recent Critters

**Files:**
- Create: `app/src/components/SightingRow.tsx`, `app/src/components/DayDetail.tsx`, `app/src/components/SightingDetail.tsx`
- Modify: `app/src/components/RecentCritters.tsx` (rows via SightingRow, optional onSelect), `app/src/App.tsx` (sheet routing, CalendarPane mount), `app/src/index.css` (detail styles)
- Test: `app/src/components/SightingDetail.test.tsx`, `app/src/App.test.tsx` (append navigation-chain + delete tests), `app/src/components/RecentCritters.test.tsx` (append onSelect test)

**Interfaces:**
- Consumes: `CalendarPane` (Task 5), `useWriteAction` (Task 4), `removeSighting` (Task 3), `formatDay`/`formatWhen`, `Sheet`, `PasswordPrompt`.
- Produces: the shipped feature. Component contracts:

```ts
SightingRow:     { sighting: Sighting; onSelect?: (id: string) => void }   // <li>; inner <button> when onSelect
DayDetail:       { date: string; sightings: Sighting[]; onSelect(id: string): void; onClose(): void }
SightingDetail:  { sighting: Sighting; onBack(): void; onDeleted(): void;
                   removeSighting(id: string, authHeader: string): Promise<void> }
// App sheet state:
type SheetState = null | { kind: 'log' } | { kind: 'day'; date: string } | { kind: 'sighting'; id: string; fromDay?: string }
```

- [ ] **Step 1: Extract SightingRow and make Recent Critters tappable**

`app/src/components/SightingRow.tsx`:

```tsx
import type { Sighting } from '../api'
import { formatWhen } from '../lib/format'

type Props = { sighting: Sighting; onSelect?: (id: string) => void }

export function SightingRow({ sighting, onSelect }: Props) {
  const body = (
    <>
      <span className="recent-emoji" aria-hidden="true">{sighting.emoji}</span>
      <span className="recent-main">
        <span className="recent-name">{sighting.name ?? sighting.emoji}</span>
        <span className="recent-meta">{formatWhen(sighting.sightedOn, sighting.sightedTime)}</span>
      </span>
      <span className="recent-chevron" aria-hidden="true">›</span>
    </>
  )
  return (
    <li className={onSelect === undefined ? 'recent-row' : undefined}>
      {onSelect === undefined ? (
        body
      ) : (
        <button type="button" className="recent-row row-button" onClick={() => onSelect(sighting.id)}>
          {body}
        </button>
      )}
    </li>
  )
}
```

`app/src/components/RecentCritters.tsx`: add `onSelect?: (id: string) => void` to Props; replace the inline `<li>` body with `<SightingRow key={s.id} sighting={s} onSelect={onSelect} />`. Existing tests must pass unchanged (rows are still `listitem`s). Append one test:

```tsx
  it('invokes onSelect with the sighting id when a row is tapped', async () => {
    const onSelect = vi.fn()
    const s = makeSighting()
    render(<RecentCritters sightings={[s]} status="ready" onRetry={() => {}} onSelect={onSelect} />)
    await userEvent.click(screen.getByRole('button', { name: /fox/i }))
    expect(onSelect).toHaveBeenCalledWith(s.id)
  })
```

Add CSS: `.row-button { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 12px; border: 1px solid var(--border-hairline); border-radius: 14px; background: #fff; cursor: pointer; }` and `li:has(> .row-button) { list-style: none; }` — simpler: keep `<li className="recent-li">` with no default styling; the button carries the row look. Ensure `.recent-list` still gaps rows.

- [ ] **Step 2: DayDetail**

`app/src/components/DayDetail.tsx`:

```tsx
import type { Sighting } from '../api'
import { formatDay } from '../lib/format'
import { SightingRow } from './SightingRow'

type Props = {
  date: string
  sightings: Sighting[]
  onSelect: (id: string) => void
  onClose: () => void
}

export function DayDetail({ date, sightings, onSelect, onClose }: Props) {
  return (
    <div className="day-detail">
      <h2 className="sheet-heading">{formatDay(date)}</h2>
      <ul className="recent-list">
        {sightings.map((s) => (
          <SightingRow key={s.id} sighting={s} onSelect={onSelect} />
        ))}
      </ul>
      <button type="button" className="btn-secondary flow-cancel" onClick={onClose}>
        Close
      </button>
    </div>
  )
}
```

- [ ] **Step 3: SightingDetail with two-tap delete (write the test first)**

`app/src/components/SightingDetail.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api'
import { setCredentials } from '../auth'
import { makeSighting, useFakeClock } from '../test/helpers'
import { SightingDetail } from './SightingDetail'

useFakeClock()

afterEach(() => {
  localStorage.clear()
})

function renderDetail(overrides: Partial<Parameters<typeof SightingDetail>[0]> = {}) {
  const removeSighting = vi.fn(async (_id: string, _h: string) => {})
  const onDeleted = vi.fn()
  const onBack = vi.fn()
  const sighting = makeSighting({ place: 'backyard', comment: 'so fluffy', sightedTime: 'dusk' })
  render(
    <SightingDetail
      sighting={sighting}
      onBack={onBack}
      onDeleted={onDeleted}
      removeSighting={removeSighting}
      {...overrides}
    />,
  )
  return { removeSighting, onDeleted, onBack, sighting }
}

describe('SightingDetail', () => {
  it('renders emoji, name, meta, place, and comment', () => {
    renderDetail()
    expect(screen.getByText('Fox')).toBeInTheDocument()
    expect(screen.getByText('Jul 2 · dusk')).toBeInTheDocument()
    expect(screen.getByText(/backyard/)).toBeInTheDocument()
    expect(screen.getByText('so fluffy')).toBeInTheDocument()
  })

  it('omits place and comment when null', () => {
    renderDetail({ sighting: makeSighting({ place: null, comment: null }) })
    expect(screen.queryByText(/📍/)).not.toBeInTheDocument()
  })

  it('requires two taps to delete, with the confirm state auto-reverting', async () => {
    setCredentials('sekrit')
    const { removeSighting, onDeleted, sighting } = renderDetail()
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(removeSighting).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Really delete?' })).toBeInTheDocument()
    await vi.advanceTimersByTimeAsync(4500)
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await userEvent.click(screen.getByRole('button', { name: 'Really delete?' }))
    expect(removeSighting).toHaveBeenCalledWith(sighting.id, 'Basic ' + btoa('natalie:sekrit'))
    await vi.waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1))
  })

  it('prompts for the password when no credentials, then deletes', async () => {
    const { removeSighting, onDeleted } = renderDetail()
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await userEvent.click(screen.getByRole('button', { name: 'Really delete?' }))
    expect(removeSighting).not.toHaveBeenCalled()
    await userEvent.type(screen.getByLabelText(/password/i), 'sekrit')
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await vi.waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1))
    expect(removeSighting).toHaveBeenCalledTimes(1)
  })

  it('shows the delete-specific 503 message and keeps the sighting', async () => {
    setCredentials('sekrit')
    const { onDeleted } = renderDetail({
      removeSighting: vi.fn(async () => {
        throw new ApiError(503)
      }),
    })
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await userEvent.click(screen.getByRole('button', { name: 'Really delete?' }))
    expect(await screen.findByText('Deleting is disabled right now')).toBeInTheDocument()
    expect(onDeleted).not.toHaveBeenCalled()
  })

  it('Back calls onBack', async () => {
    const { onBack } = renderDetail()
    await userEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
```

Run to verify failure, then implement `app/src/components/SightingDetail.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import type { Sighting } from '../api'
import { useWriteAction } from '../hooks/useWriteAction'
import { formatWhen } from '../lib/format'
import { PasswordPrompt } from './PasswordPrompt'

type Props = {
  sighting: Sighting
  onBack: () => void
  onDeleted: () => void
  removeSighting: (id: string, authHeader: string) => Promise<void>
}

const CONFIRM_WINDOW_MS = 4000

export function SightingDetail({ sighting, onBack, onDeleted, removeSighting }: Props) {
  const write = useWriteAction({
    disabled: 'Deleting is disabled right now',
    failed: "Couldn't delete — try again",
  })
  const [confirming, setConfirming] = useState(false)
  const confirmTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(confirmTimer.current), [])

  function onDeleteClick() {
    if (!confirming) {
      setConfirming(true)
      clearTimeout(confirmTimer.current)
      confirmTimer.current = setTimeout(() => setConfirming(false), CONFIRM_WINDOW_MS)
      return
    }
    clearTimeout(confirmTimer.current)
    setConfirming(false)
    write.run((authHeader) => removeSighting(sighting.id, authHeader), onDeleted)
  }

  return (
    <div className="sighting-detail">
      <div className="detail-head">
        <span className="detail-emoji" aria-hidden="true">{sighting.emoji}</span>
        <h2>{sighting.name ?? sighting.emoji}</h2>
        <p className="detail-meta">{formatWhen(sighting.sightedOn, sighting.sightedTime)}</p>
      </div>
      {sighting.place !== null && (
        <p className="detail-place">
          📍 <strong>{sighting.place}</strong>
        </p>
      )}
      {sighting.comment !== null && <p className="detail-comment">{sighting.comment}</p>}
      {write.actionError !== null && <p className="flow-error">{write.actionError}</p>}
      <div className="details-actions">
        <button type="button" className="btn-secondary" onClick={onBack}>
          Back
        </button>
        <button
          type="button"
          className={confirming ? 'btn-danger confirming' : 'btn-danger'}
          disabled={write.busy}
          onClick={onDeleteClick}
        >
          {confirming ? 'Really delete?' : 'Delete'}
        </button>
      </div>
      {write.prompt.open && (
        <div className="prompt-overlay">
          <PasswordPrompt
            open
            error={write.prompt.error}
            onCancel={write.prompt.onCancel}
            onSubmit={write.prompt.onSubmit}
          />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: App sheet routing + CalendarPane mount (tests first, appended to App.test.tsx)**

```tsx
describe('calendar navigation and delete', () => {
  it('calendar cell → day detail → sighting detail → back → day detail', async () => {
    const s = makeSighting({ sightedOn: '2026-07-02', name: 'Fox', sightedTime: 'dusk' })
    stubFetchQueue([{ status: 200, body: [s] }])
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: /jul 2/i }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Jul 2')
    await userEvent.click(screen.getByRole('button', { name: /fox/i }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Jul 2 · dusk')
    await userEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Jul 2')
    await userEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('recent critters row opens sighting detail; back closes (no fromDay)', async () => {
    const s = makeSighting({ name: 'Owl', emoji: '🦉', sightedOn: '2026-07-01' })
    stubFetchQueue([{ status: 200, body: [s] }])
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: /owl/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('two-tap delete removes the sighting everywhere and closes the sheet', async () => {
    setCredentials('sekrit')
    const s = makeSighting({ sightedOn: '2026-07-02', name: 'Fox' })
    stubFetchQueue([
      { status: 200, body: [s] },
      { status: 204, body: null },
    ])
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: /jul 2/i }))
    await userEvent.click(screen.getByRole('button', { name: /fox/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await userEvent.click(screen.getByRole('button', { name: 'Really delete?' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.queryByText('Fox')).not.toBeInTheDocument()
  })
})
```

(imports: `setCredentials` from './auth', helpers already imported from Task 1's adoption.)

Then modify `app/src/App.tsx`: replace `const [logOpen, setLogOpen] = useState(false)` with the SheetState route; mount CalendarPane in the calendar tabpanel; wire RecentCritters `onSelect`; render Day/Sighting sheets:

```tsx
type SheetState =
  | null
  | { kind: 'log' }
  | { kind: 'day'; date: string }
  | { kind: 'sighting'; id: string; fromDay?: string }
```

```tsx
  const [sheet, setSheet] = useState<SheetState>(null)
  const openSighting = (id: string, fromDay?: string) => setSheet({ kind: 'sighting', id, fromDay })
```

- Log button `onClick={() => setSheet({ kind: 'log' })}`; `LogSightingFlow open={sheet?.kind === 'log'} onClose={() => setSheet(null)}` (onLogged also `setSheet(null)`).
- Calendar tabpanel: `{activeTab === 'calendar' ? <CalendarPane sightings={sightings} onDayOpen={(date) => setSheet({ kind: 'day', date })} /> : <PlaceholderPane label={PANE_LABELS[activeTab]} />}`.
- Both RecentCritters instances get `onSelect={(id) => openSighting(id)}`.
- After the LogSightingFlow element:

```tsx
      {sheet?.kind === 'day' && (
        <Sheet open onClose={() => setSheet(null)}>
          <DayDetail
            date={sheet.date}
            sightings={sightings.filter((s) => s.sightedOn === sheet.date)}
            onSelect={(id) => openSighting(id, sheet.date)}
            onClose={() => setSheet(null)}
          />
        </Sheet>
      )}
      {sheet?.kind === 'sighting' &&
        (() => {
          const selected = sightings.find((s) => s.id === sheet.id)
          if (selected === undefined) return null
          return (
            <Sheet open onClose={() => setSheet(null)}>
              <SightingDetail
                sighting={selected}
                onBack={() =>
                  setSheet(sheet.fromDay !== undefined ? { kind: 'day', date: sheet.fromDay } : null)
                }
                onDeleted={() => setSheet(null)}
                removeSighting={removeSighting}
              />
            </Sheet>
          )
        })()}
```

(destructure `removeSighting` from `useSightings()`; import Sheet/DayDetail/SightingDetail/CalendarPane.)

- [ ] **Step 5: Detail CSS**

Append to `app/src/index.css`:

```css
.detail-head {
  text-align: center;
}

.detail-emoji {
  font-size: 44px;
  display: block;
}

.detail-head h2 {
  margin: 6px 0 2px;
  font-family: 'Fredoka', sans-serif;
  font-weight: 600;
  font-size: 18px;
}

.detail-meta {
  margin: 0;
  font-size: 13px;
  color: var(--ink-secondary);
}

.detail-place {
  font-size: 13px;
  margin: 14px 0 0;
}

.detail-comment {
  font-size: 13px;
  background: var(--surface-input);
  border-radius: 10px;
  padding: 10px 12px;
  margin: 10px 0 0;
}

.btn-danger {
  flex: 1;
  padding: 12px;
  border-radius: 14px;
  border: none;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  background: var(--danger-bg);
  color: var(--danger-text);
}

.btn-danger.confirming {
  outline: 2px solid var(--danger-text);
}

.row-button {
  all: unset;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-hairline);
  border-radius: 14px;
  background: #fff;
  cursor: pointer;
}
```

(When `SightingRow` renders a button, the outer `<li>` gets no `.recent-row` class — the button carries it plus `.row-button`; verify the recent list still looks identical in both modes.)

- [ ] **Step 6: Full gate + commit**

```bash
NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client && pnpm lint && pnpm typecheck && pnpm test && pnpm build
git add app/src
git commit -m "feat: calendar day detail and sighting detail with two-tap delete"
```

---

### Task 7: End-to-end verification (spec Definition of Done)

**Files:** none (verification; fix-forward only for transcription bugs)

- [ ] **Step 1: Bring the stack up in the worktree**

From the worktree root: `cp /Users/james/projects/github/jamesawesome/nataliesawacritter.info/.env .env` (do not modify the original), then `docker compose up -d --build`, `curl -s localhost:8080/api/health` → `{"ok":true,"db":true}`.

- [ ] **Step 2: DoD flow via API + served bundle**

```bash
PASS=$(grep '^WRITE_PASSWORD=' .env | cut -d= -f2)
TODAY=$(date +%Y-%m-%d)
curl -s -X POST -u "natalie:$PASS" -H 'content-type: application/json' \
  -d "{\"emoji\":\"🦔\",\"sightedOn\":\"$TODAY\",\"name\":\"DoD Hedgehog\"}" http://localhost:8080/api/sightings
curl -s http://localhost:8080/api/sightings | head -c 200
# served bundle contains the calendar (spot-check a marker string):
ASSET=$(curl -s http://localhost:8080/ | grep -o 'assets/index-[^"]*\.js' | head -1)
curl -s "http://localhost:8080/$ASSET" | grep -c 'Really delete?'
```

Expected: 201 row; list contains the hedgehog; grep count ≥ 1 (the new UI shipped).

- [ ] **Step 3: Delete via API, verify, leave the stack up**

```bash
ID=$(curl -s http://localhost:8080/api/sightings | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['id'])")
curl -s -X DELETE -u "natalie:$PASS" -o /dev/null -w '%{http_code}\n' http://localhost:8080/api/sightings/$ID
```

Expected: 204. Leave the stack RUNNING for the human visual pass (log a sighting in the browser → today's cell shows it → tap through day/sighting detail → two-tap delete).

- [ ] **Step 4: Full local gate**

From `app/`: `pnpm lint && pnpm typecheck && pnpm test:coverage && pnpm build` — all green.

---

## Final verification (spec Definition of Done)

- [ ] Browser: log a sighting today → today's calendar cell shows it → cell → Day Detail → row → Sighting Detail → two-tap delete → gone from calendar + Recent Critters. Month nav across year boundaries. Both breakpoints vs handoff §2/§6/§7.
- [ ] All LogSightingFlow tests passed UNCHANGED (Task 4 gate).
- [ ] Full suite, lint, typecheck, build green; CI green on the PR.
