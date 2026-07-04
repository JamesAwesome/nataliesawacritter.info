# History + Top Critters Cycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the History and Top Critters tabs and add a "Recently seen" row to the emoji picker, per `docs/superpowers/specs/2026-07-04-history-topcritters-design.md`.

**Architecture:** Extend the "one array, many derived views" pattern with a pure `lib/insights.ts` (filter/leaderboard/recent). Two new panes (`HistoryPane`, `TopCrittersPane`) and a shared `LeaderboardList` render from the in-memory `sightings`; the picker gains a recent row. App renders all three tab panels (inactive `hidden`). Opens with a polish/debt commit clearing deferred a11y items.

**Tech Stack:** React 19, TypeScript 6, Vitest 4 + Testing Library (jsdom). No new dependencies, no API changes.

**Spec:** `docs/superpowers/specs/2026-07-04-history-topcritters-design.md`
**Design source:** `docs/design/README.md` §3 (History), §4 (Top Critters)

## Global Constraints

- pnpm 11.9.0 only, from `app/`. Raw vitest invocations REQUIRE the flag: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client` (the pnpm test scripts already carry it).
- Components use CSS custom properties; no raw hexes in TSX (the leaderboard bar array uses `var(--tint-*)` token references, not hex literals).
- Copy exact: History empty "No critters logged yet 🐾" / filtered-empty "No critters in that range 😿" / "Clear" / "to"; picker "Recently seen"; leaderboard medals 🥇🥈🥉 then "#4"…; Top Critters empty "No critters logged yet 🐾"; sidebar heading "Top Critters".
- Dates: `sightedOn`/`from`/`to` are `YYYY-MM-DD`; compared lexicographically (valid for ISO). `createdAt` is an ISO timestamp string; compared lexicographically for recency.
- Leaderboard tie-break: count desc → that emoji's most-recent `createdAt` desc → emoji codepoint asc.
- Recent limit is 6; recent emoji appear even if also curated (shortcut, not filter). Inactive tab panels carry the `hidden` attribute (excluded from the a11y tree).
- Working directory: the repo (or its worktree copy); paths repo-relative.

---

### Task 1: Polish/debt opener

**Files:**
- Modify: `app/src/lib/calendar.ts` (isToday gate), `app/tsconfig.app.json` (drop "node" from types), `app/src/hooks/useIsDesktop.test.ts` (add node reference directive)
- Test: `app/src/lib/calendar.test.ts` (append), `app/src/components/DetailsForm.test.tsx` (new), `app/src/components/SightingDetail.test.tsx` (append)

**Interfaces:**
- Consumes: existing `monthGrid`, `DetailsForm`, `SightingDetail`, `makeSighting`/`useFakeClock` helpers.
- Produces: no new exports; hardens existing behavior.

Note: the ARIA "render all three tab panels" item from the spec's opener is implemented in Task 6 (the App-wiring task), where the panel structure is rewritten to hold the real panes — doing it once there is cleaner than rendering three placeholders here.

- [ ] **Step 1: Calendar today-ring — write the failing test**

Append to `app/src/lib/calendar.test.ts` inside the `describe('monthGrid', ...)` block:

```ts
  it('only marks today when the cell is in-month (not a bleed day)', () => {
    // today = 2026-08-01; viewing July 2026, whose trailing cells include Aug 1
    const cells = monthGrid(2026, 7, [], '2026-08-01')
    const bleed = cells.find((c) => c.date === '2026-08-01')!
    expect(bleed.inMonth).toBe(false)
    expect(bleed.isToday).toBe(false)
    // and an in-month today is still flagged
    expect(monthGrid(2026, 8, [], '2026-08-01').find((c) => c.date === '2026-08-01')!.isToday).toBe(true)
  })
```

- [ ] **Step 2: Run to verify it fails**

Run (from `app/`): `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client`
Expected: FAIL — the bleed `2026-08-01` currently has `isToday: true`.

- [ ] **Step 3: Gate isToday on inMonth**

In `app/src/lib/calendar.ts`, change the cell object in `monthGrid`:

```ts
      inMonth: d.getMonth() === month - 1,
      isToday: d.getMonth() === month - 1 && date === today,
```

- [ ] **Step 4: DetailsForm empty-date guard — add its test**

The guard already exists (`DetailsForm.tsx:66`, `disabled={saving || sightedOn === ''}`); this pins it. Create `app/src/components/DetailsForm.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useFakeClock } from '../test/helpers'
import { DetailsForm } from './DetailsForm'

useFakeClock()

describe('DetailsForm', () => {
  it('disables Save when the date is cleared', () => {
    render(<DetailsForm emoji="🦊" initialName="Fox" onBack={() => {}} onSave={vi.fn()} saving={false} />)
    const save = screen.getByRole('button', { name: /save sighting/i })
    expect(save).toBeEnabled()
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '' } })
    expect(save).toBeDisabled()
  })

  it('disables Save while saving', () => {
    render(<DetailsForm emoji="🦊" initialName="Fox" onBack={() => {}} onSave={vi.fn()} saving={true} />)
    expect(screen.getByRole('button', { name: /save sighting/i })).toBeDisabled()
  })
})
```

- [ ] **Step 5: SightingDetail delete-401 — add its test**

Append to the `describe('SightingDetail', ...)` block in `app/src/components/SightingDetail.test.tsx` (the file already imports `ApiError`, `setCredentials`, `makeSighting`, `useFakeClock`, `userEvent`; reuse its `renderDetail` helper):

```tsx
  it('re-prompts for the password when delete returns 401', async () => {
    setCredentials('wrong')
    renderDetail({
      removeSighting: vi.fn(async () => {
        throw new ApiError(401)
      }),
    })
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await userEvent.click(screen.getByRole('button', { name: 'Really delete?' }))
    expect(await screen.findByLabelText(/password/i)).toBeInTheDocument()
    expect(localStorage.getItem('critter-write-auth')).toBeNull()
  })
```

- [ ] **Step 6: tsconfig node-types scoping**

In `app/tsconfig.app.json`, change the `types` array from:

```json
    "types": ["node", "vitest/globals", "@testing-library/jest-dom"]
```

to:

```json
    "types": ["vitest/globals", "@testing-library/jest-dom"]
```

Then add, as the very first line of `app/src/hooks/useIsDesktop.test.ts` (the only src file importing node builtins — `node:fs`/`node:url` for the breakpoint sync-guard):

```ts
/// <reference types="node" />
```

- [ ] **Step 7: Full gate + commit**

Run (from `app/`): `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client && pnpm lint && pnpm typecheck`
Expected: all green. If `typecheck` reports another src file needing node types, add the same reference directive to that file and note it in the report (do not restore the blanket "node" type).

```bash
git add app/src/lib/calendar.ts app/src/lib/calendar.test.ts app/tsconfig.app.json app/src/hooks/useIsDesktop.test.ts app/src/components/DetailsForm.test.tsx app/src/components/SightingDetail.test.tsx
git commit -m "chore: clear deferred polish batch (calendar today-ring, node types, empty-date + 401 tests)"
```

---

### Task 2: lib/insights.ts + nameFor (pure derivations, TDD)

**Files:**
- Create: `app/src/lib/insights.ts`
- Modify: `app/src/lib/critters.ts` (add `nameFor`)
- Test: `app/src/lib/insights.test.ts`, `app/src/lib/critters.test.ts` (append)

**Interfaces:**
- Consumes: `Sighting` from `../api`; `CURATED` from `./critters`; `makeSighting` helper.
- Produces (Tasks 3–6 consume exactly):

```ts
export function filterByRange(sightings: Sighting[], from?: string, to?: string): Sighting[]
export type LeaderRow = { emoji: string; count: number }
export function leaderboard(sightings: Sighting[]): LeaderRow[]
export function recentEmoji(sightings: Sighting[], limit: number): string[]
// critters.ts:
export function nameFor(emoji: string): string | null
```

- [ ] **Step 1: Write the failing tests**

`app/src/lib/insights.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { makeSighting } from '../test/helpers'
import { filterByRange, leaderboard, recentEmoji } from './insights'

describe('filterByRange', () => {
  const rows = [
    makeSighting({ id: 'a', sightedOn: '2026-07-01' }),
    makeSighting({ id: 'b', sightedOn: '2026-07-15' }),
    makeSighting({ id: 'c', sightedOn: '2026-07-31' }),
  ]

  it('returns everything when both bounds are empty', () => {
    expect(filterByRange(rows).map((s) => s.id)).toEqual(['a', 'b', 'c'])
    expect(filterByRange(rows, '', '').map((s) => s.id)).toEqual(['a', 'b', 'c'])
  })

  it('is inclusive on both bounds', () => {
    expect(filterByRange(rows, '2026-07-15', '2026-07-31').map((s) => s.id)).toEqual(['b', 'c'])
    expect(filterByRange(rows, '2026-07-01', '2026-07-15').map((s) => s.id)).toEqual(['a', 'b'])
  })

  it('supports open-ended bounds', () => {
    expect(filterByRange(rows, '2026-07-15').map((s) => s.id)).toEqual(['b', 'c'])
    expect(filterByRange(rows, undefined, '2026-07-01').map((s) => s.id)).toEqual(['a'])
  })

  it('preserves input order and can exclude everything', () => {
    expect(filterByRange(rows, '2026-08-01')).toEqual([])
    expect(filterByRange([])).toEqual([])
  })
})

describe('leaderboard', () => {
  it('counts by emoji, descending', () => {
    const rows = [
      makeSighting({ emoji: '🦊' }),
      makeSighting({ emoji: '🦊' }),
      makeSighting({ emoji: '🦉' }),
    ]
    expect(leaderboard(rows)).toEqual([
      { emoji: '🦊', count: 2 },
      { emoji: '🦉', count: 1 },
    ])
  })

  it('breaks count ties by most-recent sighting, then codepoint', () => {
    const rows = [
      makeSighting({ emoji: '🐸', createdAt: '2026-07-01T00:00:00.000Z' }),
      makeSighting({ emoji: '🦆', createdAt: '2026-07-05T00:00:00.000Z' }),
      makeSighting({ emoji: '🐢', createdAt: '2026-07-05T00:00:00.000Z' }),
    ]
    // all count 1: 🦆 and 🐢 share the latest createdAt → codepoint tiebreak (🐢 U+1F422 < 🦆 U+1F986); 🐸 oldest last
    expect(leaderboard(rows).map((r) => r.emoji)).toEqual(['🐢', '🦆', '🐸'])
  })

  it('is empty for no sightings', () => {
    expect(leaderboard([])).toEqual([])
  })
})

describe('recentEmoji', () => {
  it('returns distinct emoji by most-recent createdAt, up to the limit', () => {
    const rows = [
      makeSighting({ emoji: '🦊', createdAt: '2026-07-01T00:00:00.000Z' }),
      makeSighting({ emoji: '🦉', createdAt: '2026-07-03T00:00:00.000Z' }),
      makeSighting({ emoji: '🦊', createdAt: '2026-07-05T00:00:00.000Z' }),
      makeSighting({ emoji: '🐸', createdAt: '2026-07-02T00:00:00.000Z' }),
    ]
    expect(recentEmoji(rows, 6)).toEqual(['🦊', '🦉', '🐸'])
  })

  it('respects the limit and handles a back-dated sighting logged most recently', () => {
    const rows = [
      makeSighting({ emoji: '🦌', sightedOn: '2020-01-01', createdAt: '2026-07-09T00:00:00.000Z' }),
      makeSighting({ emoji: '🦉', createdAt: '2026-07-08T00:00:00.000Z' }),
      makeSighting({ emoji: '🐢', createdAt: '2026-07-07T00:00:00.000Z' }),
    ]
    // ordered by createdAt (when logged), NOT sightedOn → 🦌 first despite its old date
    expect(recentEmoji(rows, 2)).toEqual(['🦌', '🦉'])
    expect(recentEmoji([], 6)).toEqual([])
  })
})
```

Append to `app/src/lib/critters.test.ts`:

```ts
import { nameFor } from './critters'

describe('nameFor', () => {
  it('returns the curated name for a curated emoji, null otherwise', () => {
    expect(nameFor('🦊')).toBe('Fox')
    expect(nameFor('🐙')).toBeNull()
  })
})
```

(Ensure `describe`/`it`/`expect` are imported in critters.test.ts — they already are.)

- [ ] **Step 2: Run to verify failure**

Run (from `app/`): `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client`
Expected: FAIL — `./insights` and `nameFor` unresolved.

- [ ] **Step 3: Implement**

`app/src/lib/insights.ts`:

```ts
import type { Sighting } from '../api'

/** Inclusive on both bounds; empty/undefined bound = open. Preserves input order. */
export function filterByRange(sightings: Sighting[], from?: string, to?: string): Sighting[] {
  return sightings.filter((s) => {
    if (from && s.sightedOn < from) return false
    if (to && s.sightedOn > to) return false
    return true
  })
}

export type LeaderRow = { emoji: string; count: number }

/** count desc, then that emoji's most-recent createdAt desc, then emoji codepoint asc. */
export function leaderboard(sightings: Sighting[]): LeaderRow[] {
  const groups = new Map<string, { count: number; latest: string }>()
  for (const s of sightings) {
    const g = groups.get(s.emoji)
    if (g === undefined) groups.set(s.emoji, { count: 1, latest: s.createdAt })
    else {
      g.count += 1
      if (s.createdAt > g.latest) g.latest = s.createdAt
    }
  }
  return [...groups.entries()]
    .map(([emoji, g]) => ({ emoji, ...g }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        (a.latest < b.latest ? 1 : a.latest > b.latest ? -1 : 0) ||
        (a.emoji < b.emoji ? -1 : a.emoji > b.emoji ? 1 : 0),
    )
    .map(({ emoji, count }) => ({ emoji, count }))
}

/** Distinct emoji ordered by most-recent createdAt, first `limit` kept. */
export function recentEmoji(sightings: Sighting[], limit: number): string[] {
  const byRecency = [...sightings].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
  )
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of byRecency) {
    if (seen.has(s.emoji)) continue
    seen.add(s.emoji)
    out.push(s.emoji)
    if (out.length >= limit) break
  }
  return out
}
```

Append to `app/src/lib/critters.ts`:

```ts
export function nameFor(emoji: string): string | null {
  return CURATED.find((c) => c.emoji === emoji)?.name ?? null
}
```

- [ ] **Step 4: Run to verify pass, lint/typecheck, commit**

```bash
NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client && pnpm lint && pnpm typecheck
git add app/src/lib/insights.ts app/src/lib/insights.test.ts app/src/lib/critters.ts app/src/lib/critters.test.ts
git commit -m "feat: insights derivations (filter/leaderboard/recent) and nameFor"
```

---

### Task 3: HistoryPane (date-range filter + list, TDD)

**Files:**
- Create: `app/src/components/HistoryPane.tsx`
- Modify: `app/src/index.css` (history styles)
- Test: `app/src/components/HistoryPane.test.tsx`

**Interfaces:**
- Consumes: `filterByRange` (Task 2); `SightingRow` (existing); `Sighting`; `makeSighting`.
- Produces: `HistoryPane: { sightings: Sighting[]; onSelect(id: string): void }` — Task 6 mounts it in the history tabpanel.

- [ ] **Step 1: Write the failing tests**

`app/src/components/HistoryPane.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { makeSighting, useFakeClock } from '../test/helpers'
import { HistoryPane } from './HistoryPane'

useFakeClock()

const ROWS = [
  makeSighting({ id: 'a', name: 'Fox', emoji: '🦊', sightedOn: '2026-07-20' }),
  makeSighting({ id: 'b', name: 'Owl', emoji: '🦉', sightedOn: '2026-07-10' }),
  makeSighting({ id: 'c', name: 'Frog', emoji: '🐸', sightedOn: '2026-07-01' }),
]

describe('HistoryPane', () => {
  it('lists all sightings and hides Clear until a bound is set', () => {
    render(<HistoryPane sightings={ROWS} onSelect={() => {}} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument()
  })

  it('filters inclusively by From/To and shows Clear', () => {
    render(<HistoryPane sightings={ROWS} onSelect={() => {}} />)
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-07-05' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-07-20' } })
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[0]).getByText('Fox')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument()
  })

  it('Clear resets both bounds', async () => {
    render(<HistoryPane sightings={ROWS} onSelect={() => {}} />)
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-07-15' } })
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: /clear/i }))
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByLabelText('From')).toHaveValue('')
  })

  it('taps a row through onSelect', async () => {
    const onSelect = vi.fn()
    render(<HistoryPane sightings={ROWS} onSelect={onSelect} />)
    await userEvent.click(screen.getByRole('button', { name: /fox/i }))
    expect(onSelect).toHaveBeenCalledWith('a')
  })

  it('shows the empty state and the filtered-empty state', () => {
    const { rerender } = render(<HistoryPane sightings={[]} onSelect={() => {}} />)
    expect(screen.getByText(/no critters logged yet/i)).toBeInTheDocument()
    rerender(<HistoryPane sightings={ROWS} onSelect={() => {}} />)
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-08-01' } })
    expect(screen.getByText(/no critters in that range/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

`app/src/components/HistoryPane.tsx`:

```tsx
import { useState } from 'react'
import type { Sighting } from '../api'
import { filterByRange } from '../lib/insights'
import { SightingRow } from './SightingRow'

type Props = { sightings: Sighting[]; onSelect: (id: string) => void }

export function HistoryPane({ sightings, onSelect }: Props) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const filtered = filterByRange(sightings, from, to)
  const hasFilter = from !== '' || to !== ''

  return (
    <section className="history-pane">
      <div className="history-filter">
        <input
          type="date"
          aria-label="From"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <span className="filter-to">to</span>
        <input
          type="date"
          aria-label="To"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        {hasFilter && (
          <button
            type="button"
            className="link-button"
            onClick={() => {
              setFrom('')
              setTo('')
            }}
          >
            Clear
          </button>
        )}
      </div>
      {sightings.length === 0 ? (
        <p className="muted">No critters logged yet 🐾</p>
      ) : filtered.length === 0 ? (
        <p className="muted">No critters in that range 😿</p>
      ) : (
        <ul className="recent-list">
          {filtered.map((s) => (
            <SightingRow key={s.id} sighting={s} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Append history CSS to `app/src/index.css`**

```css
.history-pane {
  padding-top: 4px;
}

.history-filter {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 12px 0;
}

.history-filter input[type='date'] {
  padding: 8px 10px;
  border: 1px solid var(--border-hairline);
  border-radius: 12px;
  background: var(--surface-input);
  font: inherit;
  color: var(--ink);
}

.filter-to {
  font-size: 12px;
  color: var(--ink-secondary);
}
```

- [ ] **Step 5: Run to verify pass, lint/typecheck, commit**

```bash
NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client && pnpm lint && pnpm typecheck
git add app/src/components/HistoryPane.tsx app/src/components/HistoryPane.test.tsx app/src/index.css
git commit -m "feat: history tab with inclusive date-range filter"
```

---

### Task 4: LeaderboardList + TopCrittersPane (TDD)

**Files:**
- Create: `app/src/components/LeaderboardList.tsx`, `app/src/components/TopCrittersPane.tsx`
- Modify: `app/src/index.css` (leaderboard styles + `--bar-track` token)
- Test: `app/src/components/LeaderboardList.test.tsx`, `app/src/components/TopCrittersPane.test.tsx`

**Interfaces:**
- Consumes: `LeaderRow`/`leaderboard` (Task 2); `nameFor` (Task 2); `Sighting`; `makeSighting`.
- Produces: `LeaderboardList: { rows: LeaderRow[] }` (shared by the tab and the sidebar); `TopCrittersPane: { sightings: Sighting[] }` — Task 6 mounts the pane and the sidebar list.

- [ ] **Step 1: Write the failing tests**

`app/src/components/LeaderboardList.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { LeaderRow } from '../lib/insights'
import { LeaderboardList } from './LeaderboardList'

const ROWS: LeaderRow[] = [
  { emoji: '🦊', count: 10 },
  { emoji: '🦉', count: 5 },
  { emoji: '🐸', count: 3 },
  { emoji: '🐢', count: 1 },
]

describe('LeaderboardList', () => {
  it('renders rank medals for the top 3 then #N', () => {
    render(<LeaderboardList rows={ROWS} />)
    const items = screen.getAllByRole('listitem')
    expect(within(items[0]).getByText('🥇')).toBeInTheDocument()
    expect(within(items[1]).getByText('🥈')).toBeInTheDocument()
    expect(within(items[2]).getByText('🥉')).toBeInTheDocument()
    expect(within(items[3]).getByText('#4')).toBeInTheDocument()
  })

  it('shows counts and preserves input (ranked) order', () => {
    render(<LeaderboardList rows={ROWS} />)
    const items = screen.getAllByRole('listitem')
    expect(within(items[0]).getByText('10')).toBeInTheDocument()
    expect(within(items[3]).getByText('1')).toBeInTheDocument()
  })

  it('scales bar width by count/max and floors it at 8%', () => {
    render(<LeaderboardList rows={[{ emoji: '🦊', count: 100 }, { emoji: '🐢', count: 1 }]} />)
    const fills = document.querySelectorAll<HTMLElement>('.leader-bar-fill')
    expect(fills[0].style.width).toBe('100%') // max
    expect(fills[1].style.width).toBe('8%') // 1/100 = 1% → floored to 8%
  })

  it('rows are not tappable (no buttons)', () => {
    render(<LeaderboardList rows={ROWS} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
```

`app/src/components/TopCrittersPane.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { makeSighting } from '../test/helpers'
import { TopCrittersPane } from './TopCrittersPane'

describe('TopCrittersPane', () => {
  it('ranks sightings by count', () => {
    const rows = [
      makeSighting({ emoji: '🦊' }),
      makeSighting({ emoji: '🦊' }),
      makeSighting({ emoji: '🦉' }),
    ]
    render(<TopCrittersPane sightings={rows} />)
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('🦊')
    expect(items[0]).toHaveTextContent('2')
  })

  it('shows the empty state', () => {
    render(<TopCrittersPane sightings={[]} />)
    expect(screen.getByText(/no critters logged yet/i)).toBeInTheDocument()
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement**

`app/src/components/LeaderboardList.tsx`:

```tsx
import { nameFor } from '../lib/critters'
import type { LeaderRow } from '../lib/insights'

// docs/design/README.md §4 — the 7-stop rainbow, cycled index i and i+2 per row.
// Token references (not hex) keep the no-raw-hex rule.
const BAR_COLORS = [
  'var(--tint-pink)',
  'var(--tint-peach)',
  'var(--tint-yellow)',
  'var(--tint-mint)',
  'var(--tint-aqua)',
  'var(--tint-sky)',
  'var(--tint-lavender)',
]
const MEDALS = ['🥇', '🥈', '🥉']

type Props = { rows: LeaderRow[] }

export function LeaderboardList({ rows }: Props) {
  const max = rows.length > 0 ? rows[0].count : 1 // rows are count-desc, so [0] is the max
  return (
    <ol className="leaderboard">
      {rows.map((row, i) => {
        const width = Math.max(8, (row.count / max) * 100)
        const gradient = `linear-gradient(90deg, ${BAR_COLORS[i % 7]}, ${BAR_COLORS[(i + 2) % 7]})`
        return (
          <li
            key={row.emoji}
            className="leader-row"
            aria-label={`Rank ${i + 1}: ${nameFor(row.emoji) ?? row.emoji}, ${row.count} sighting${row.count === 1 ? '' : 's'}`}
          >
            <span className="leader-rank">{i < 3 ? MEDALS[i] : `#${i + 1}`}</span>
            <span className="leader-emoji" aria-hidden="true">
              {row.emoji}
            </span>
            <span className="leader-bar-track">
              <span className="leader-bar-fill" style={{ width: `${width}%`, background: gradient }} />
            </span>
            <span className="leader-count">{row.count}</span>
          </li>
        )
      })}
    </ol>
  )
}
```

`app/src/components/TopCrittersPane.tsx`:

```tsx
import type { Sighting } from '../api'
import { leaderboard } from '../lib/insights'
import { LeaderboardList } from './LeaderboardList'

type Props = { sightings: Sighting[] }

export function TopCrittersPane({ sightings }: Props) {
  const rows = leaderboard(sightings)
  if (rows.length === 0) {
    return (
      <section className="top-critters-pane">
        <p className="muted">No critters logged yet 🐾</p>
      </section>
    )
  }
  return (
    <section className="top-critters-pane">
      <LeaderboardList rows={rows} />
    </section>
  )
}
```

- [ ] **Step 4: Append leaderboard CSS + token to `app/src/index.css`**

Add to `:root`:

```css
  --bar-track: #eef3fb;
```

Append rules:

```css
.top-critters-pane {
  padding-top: 8px;
}

.leaderboard {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.leader-row {
  display: grid;
  grid-template-columns: 22px 28px 1fr auto;
  align-items: center;
  gap: 8px;
}

.leader-rank {
  font-size: 13px;
  font-weight: 700;
  color: var(--ink-tertiary);
  text-align: center;
}

.leader-emoji {
  font-size: 20px;
}

.leader-bar-track {
  height: 10px;
  border-radius: 999px;
  background: var(--bar-track);
  overflow: hidden;
}

.leader-bar-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
}

.leader-count {
  font-size: 14px;
  font-weight: 700;
  color: var(--ink);
  text-align: right;
}

.sidebar-heading {
  font-family: 'Fredoka', sans-serif;
  font-weight: 600;
  font-size: 14px;
  margin: 16px 0 8px;
}
```

- [ ] **Step 5: Run to verify pass, lint/typecheck, commit**

```bash
NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client && pnpm lint && pnpm typecheck
git add app/src/components/LeaderboardList.tsx app/src/components/LeaderboardList.test.tsx app/src/components/TopCrittersPane.tsx app/src/components/TopCrittersPane.test.tsx app/src/index.css
git commit -m "feat: top critters leaderboard list and pane"
```

---

### Task 5: Recently seen row in the emoji picker

**Files:**
- Modify: `app/src/components/EmojiPicker.tsx` (recent prop + row), `app/src/components/LogSightingFlow.tsx` (forward optional recent prop)
- Modify: `app/src/index.css` (recent-row styles)
- Test: `app/src/components/EmojiPicker.test.tsx` (new)

**Interfaces:**
- Consumes: `nameFor`, `CURATED`, `EXTENDED` (from `../lib/critters`).
- Produces: `EmojiPicker` now requires `recent: string[]`; `LogSightingFlow` gains optional `recent?: string[]` (defaults to `[]`, so its existing tests — which pass no `recent` — are unaffected). Task 6 passes `recent` from App.

- [ ] **Step 1: Write the failing tests**

`app/src/components/EmojiPicker.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { EmojiPicker } from './EmojiPicker'

describe('EmojiPicker recently-seen row', () => {
  it('hides the recent row when there are no recent emoji', () => {
    render(<EmojiPicker recent={[]} onPick={() => {}} onCancel={() => {}} />)
    expect(screen.queryByText('Recently seen')).not.toBeInTheDocument()
    // curated grid still present
    expect(screen.getByRole('button', { name: 'Deer' })).toBeInTheDocument()
  })

  it('shows recent emoji above the curated grid and pre-fills a curated name on pick', async () => {
    const onPick = vi.fn()
    render(<EmojiPicker recent={['🦊', '🐙']} onPick={onPick} onCancel={() => {}} />)
    expect(screen.getByText('Recently seen')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Recently seen Fox' }))
    expect(onPick).toHaveBeenCalledWith('🦊', 'Fox')
  })

  it('leaves the name blank when a recent non-curated emoji is picked', async () => {
    const onPick = vi.fn()
    render(<EmojiPicker recent={['🐙']} onPick={onPick} onCancel={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Recently seen 🐙' }))
    expect(onPick).toHaveBeenCalledWith('🐙', null)
  })

  it('still shows the curated Fox tile distinctly from the recent Fox', () => {
    render(<EmojiPicker recent={['🦊']} onPick={() => {}} onCancel={() => {}} />)
    expect(screen.getByRole('button', { name: 'Fox' })).toBeInTheDocument() // curated
    expect(screen.getByRole('button', { name: 'Recently seen Fox' })).toBeInTheDocument() // recent
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client`
Expected: FAIL — `EmojiPicker` doesn't accept `recent`/render the row.

- [ ] **Step 3: Implement EmojiPicker**

`app/src/components/EmojiPicker.tsx` (full replacement):

```tsx
import { useState } from 'react'
import { CURATED, EXTENDED, nameFor } from '../lib/critters'

type Props = {
  recent: string[]
  onPick: (emoji: string, name: string | null) => void
  onCancel: () => void
}

export function EmojiPicker({ recent, onPick, onCancel }: Props) {
  const [showExtended, setShowExtended] = useState(false)
  return (
    <div className="emoji-picker">
      <h2 className="sheet-heading">What did Natalie see?</h2>
      {recent.length > 0 && (
        <>
          <h3 className="picker-recent-heading">Recently seen</h3>
          <div className="picker-grid picker-grid-recent">
            {recent.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="picker-tile"
                aria-label={`Recently seen ${nameFor(emoji) ?? emoji}`}
                onClick={() => onPick(emoji, nameFor(emoji))}
              >
                {emoji}
              </button>
            ))}
          </div>
        </>
      )}
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

- [ ] **Step 4: Forward the recent prop through LogSightingFlow**

In `app/src/components/LogSightingFlow.tsx`, add `recent` to Props (optional) and pass it to `EmojiPicker`. Change the Props type:

```tsx
type Props = {
  open: boolean
  onClose: () => void
  onSave: (fields: NewSightingInput, authHeader: string) => Promise<void>
  onLogged: () => void
  recent?: string[]
}
```

Destructure it with a default and forward it:

```tsx
export function LogSightingFlow({ open, onClose, onSave, onLogged, recent = [] }: Props) {
```

and where `EmojiPicker` is rendered, add the prop:

```tsx
        <EmojiPicker recent={recent} onPick={(emoji, name) => setPicked({ emoji, name })} onCancel={close} />
```

(Leave all other LogSightingFlow behavior untouched — its existing tests pass no `recent` and must still pass.)

- [ ] **Step 5: Append recent-row CSS to `app/src/index.css`**

```css
.picker-recent-heading {
  font-family: 'Quicksand', sans-serif;
  font-weight: 700;
  font-size: 12px;
  color: var(--ink-secondary);
  margin: 4px 0 8px;
}

.picker-grid-recent {
  margin-bottom: 12px;
}
```

- [ ] **Step 6: Run the full suite (LogSightingFlow tests must still pass), commit**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client && pnpm lint && pnpm typecheck`
Expected: all green, including `LogSightingFlow.test.tsx` unchanged. Confirm via `git status` that `LogSightingFlow.test.tsx` is NOT modified.

```bash
git add app/src/components/EmojiPicker.tsx app/src/components/EmojiPicker.test.tsx app/src/components/LogSightingFlow.tsx app/src/index.css
git commit -m "feat: recently-seen row in the emoji picker"
```

---

### Task 6: App wiring — mount panes, sidebar leaderboard, thread recent, ARIA panels

**Files:**
- Modify: `app/src/App.tsx`
- Delete: `app/src/components/PlaceholderPane.tsx` (now fully unused)
- Test: `app/src/App.test.tsx` (update the obsolete placeholder test; append new coverage)

**Interfaces:**
- Consumes: `HistoryPane` (Task 3), `TopCrittersPane`/`LeaderboardList` (Task 4), `leaderboard`/`recentEmoji` (Task 2), `LogSightingFlow` `recent` prop (Task 5).
- Produces: the shipped feature.

- [ ] **Step 1: Update App tests (the placeholder test is now obsolete) and add coverage**

In `app/src/App.test.tsx`: find the existing test that switches to a tab and asserts placeholder "coming soon" text — replace its body so it asserts the real History pane. Then append the new tests. (The file already imports `makeSighting`, `useFakeClock`, `stubFetchQueue`, `screen`, `userEvent`, `within`, `waitFor`, `App`, `setCredentials`.)

Replacement for the placeholder-switch test:

```tsx
  it('switches to the History tab and shows the date filter + empty state', async () => {
    stubFetchQueue([{ status: 200, body: [] }])
    render(<App />)
    await userEvent.click(screen.getByRole('tab', { name: 'History' }))
    expect(screen.getByLabelText('From')).toBeInTheDocument()
    expect(screen.getByText(/no critters logged yet/i)).toBeInTheDocument()
  })
```

Append:

```tsx
  it('ranks sightings on the Top Critters tab', async () => {
    stubFetchQueue([
      { status: 200, body: [makeSighting({ emoji: '🦊' }), makeSighting({ emoji: '🦊' }), makeSighting({ emoji: '🦉' })] },
    ])
    render(<App />)
    await userEvent.click(screen.getByRole('tab', { name: 'Top Critters' }))
    const items = await screen.findAllByRole('listitem')
    expect(items[0]).toHaveTextContent('🦊')
    expect(items[0]).toHaveTextContent('2')
  })

  it('surfaces recently seen critters in the picker after sightings load', async () => {
    stubFetchQueue([{ status: 200, body: [makeSighting({ emoji: '🦉', name: 'Owl' })] }])
    render(<App />)
    await userEvent.click(screen.getAllByRole('button', { name: /log a sighting/i })[0])
    expect(await screen.findByRole('button', { name: 'Recently seen Owl' })).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run to verify failure**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client`
Expected: FAIL — the new tests fail (placeholders still rendered / recent not threaded); the replaced placeholder test fails against current code.

- [ ] **Step 3: Rewire App.tsx**

`app/src/App.tsx` — apply these changes:

Imports: remove `PlaceholderPane`; add the new panes and derivations:

```tsx
import { CalendarPane } from './components/CalendarPane'
import { DayDetail } from './components/DayDetail'
import { Header } from './components/Header'
import { HistoryPane } from './components/HistoryPane'
import { LeaderboardList } from './components/LeaderboardList'
import { LogSightingFlow } from './components/LogSightingFlow'
import { RecentCritters } from './components/RecentCritters'
import { Sheet } from './components/Sheet'
import { SightingDetail } from './components/SightingDetail'
import { Tabs, type Tab } from './components/Tabs'
import { TopCrittersPane } from './components/TopCrittersPane'
import { Toast } from './components/Toast'
import { useIsDesktop } from './hooks/useIsDesktop'
import { useSightings } from './hooks/useSightings'
import { leaderboard, recentEmoji } from './lib/insights'
```

Remove the `PANE_LABELS` constant (no longer used).

Replace the `<main className="main-col">` panel block (the current `<div role="tabpanel" ...>` and its contents) with all three panels, inactive `hidden`:

```tsx
          <main className="main-col">
            <div className="mobile-only">{logButton}</div>
            {status === 'error' && (
              <p className="flow-error">
                Couldn't load sightings 😿{' '}
                <button type="button" className="link-button" onClick={retry}>
                  Retry
                </button>
              </p>
            )}
            <div role="tabpanel" id="pane-calendar" hidden={activeTab !== 'calendar'}>
              <CalendarPane sightings={sightings} onDayOpen={(date) => setSheet({ kind: 'day', date })} />
              {!isDesktop && (
                <RecentCritters
                  sightings={sightings}
                  status={status}
                  onRetry={retry}
                  onSelect={(id) => openSighting(id)}
                />
              )}
            </div>
            <div role="tabpanel" id="pane-history" hidden={activeTab !== 'history'}>
              <HistoryPane sightings={sightings} onSelect={(id) => openSighting(id)} />
            </div>
            <div role="tabpanel" id="pane-leaderboard" hidden={activeTab !== 'leaderboard'}>
              <TopCrittersPane sightings={sightings} />
            </div>
          </main>
```

Extend the sidebar with the top-10 leaderboard below Recent Critters:

```tsx
          <aside className="sidebar desktop-only">
            {logButton}
            {isDesktop && (
              <RecentCritters
                sightings={sightings}
                status={status}
                onRetry={retry}
                onSelect={(id) => openSighting(id)}
              />
            )}
            {isDesktop && sightings.length > 0 && (
              <>
                <h2 className="sidebar-heading">Top Critters</h2>
                <LeaderboardList rows={leaderboard(sightings).slice(0, 10)} />
              </>
            )}
          </aside>
```

Thread `recent` into the log flow:

```tsx
      <LogSightingFlow
        open={sheet?.kind === 'log'}
        onClose={() => setSheet(null)}
        onSave={addSighting}
        onLogged={() => {
          setSheet(null)
          showToast('🎉 Logged!')
        }}
        recent={recentEmoji(sightings, 6)}
      />
```

(The `day`/`sighting` sheet blocks and everything else stay exactly as they are.)

- [ ] **Step 4: Delete the now-unused PlaceholderPane**

```bash
git rm app/src/components/PlaceholderPane.tsx
```

Confirm nothing else imports it: `grep -rn PlaceholderPane app/src` returns nothing.

- [ ] **Step 5: Run to verify pass, full gate, commit**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client && pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: all green. If a pre-existing App test breaks because the panel structure or sidebar content changed (e.g. a `getAllByRole('listitem')` that now also sees the sidebar leaderboard), adapt the WIRING or the test's query to preserve its original intent — never weaken an assertion — and note the adaptation in your report.

```bash
git add app/src/App.tsx app/src/App.test.tsx
git commit -m "feat: mount history + top critters panes, sidebar leaderboard, recent-seen row"
```

---

### Task 7: End-to-end verification (spec Definition of Done)

**Files:** none (verification; fix-forward only for transcription bugs)

- [ ] **Step 1: Bring the stack up in the worktree**

From the worktree root: `cp /Users/james/projects/github/jamesawesome/nataliesawacritter.info/.env .env` (do not modify the original). If port 8080 is held by a stale stack from a prior worktree, `docker ps` and `docker stop <name>` first (report if you did). Then `docker compose up -d --build`, `curl -s localhost:8080/api/health` → `{"ok":true,"db":true}`.

- [ ] **Step 2: DoD flow via API + served bundle**

```bash
PASS=$(grep '^WRITE_PASSWORD=' .env | cut -d= -f2)
for d in 2026-07-01 2026-07-01 2026-07-15; do
  emoji=$([ "$d" = 2026-07-15 ] && echo '🦉' || echo '🦊')
  curl -s -X POST -u "natalie:$PASS" -H 'content-type: application/json' \
    -d "{\"emoji\":\"$emoji\",\"sightedOn\":\"$d\"}" http://localhost:8080/api/sightings >/dev/null
done
curl -s 'http://localhost:8080/api/sightings' | python3 -c "import json,sys; d=json.load(sys.stdin); print('count', len(d))"
ASSET=$(curl -s http://localhost:8080/ | grep -o 'assets/index-[^"]*\.js' | head -1)
curl -s "http://localhost:8080/$ASSET" | grep -c 'Recently seen'
```

Expected: count 3; grep count ≥ 1 (the recent-row string shipped in the bundle). Confirms the History list, leaderboard (🦊 count 2 ranks above 🦉), and recent row have real data to render.

- [ ] **Step 3: Delete the test rows, leave the stack up**

```bash
PASS=$(grep '^WRITE_PASSWORD=' .env | cut -d= -f2)
for id in $(curl -s http://localhost:8080/api/sightings | python3 -c "import json,sys; [print(s['id']) for s in json.load(sys.stdin)]"); do
  curl -s -X DELETE -u "natalie:$PASS" -o /dev/null http://localhost:8080/api/sightings/$id
done
```

Leave the stack RUNNING for the human visual pass (History filter, Top Critters bars/medals, desktop sidebar top-10, the picker's Recently seen row).

- [ ] **Step 4: Full local gate**

From `app/`: `pnpm lint && pnpm typecheck && pnpm test:coverage && pnpm build` — all green.

---

## Final verification (spec Definition of Done)

- [ ] Browser: log varied sightings → History lists most-recent-first and filters inclusively by From/To with Clear → Top Critters ranks with medals + proportional rainbow bars → desktop sidebar shows top 10 → the picker's Recently seen row surfaces just-logged critters and one tap re-logs one.
- [ ] Both breakpoints match handoff §3/§4; sidebar renders only on desktop and only when non-empty.
- [ ] Polish batch landed (calendar today-ring, empty-date + 401 tests, tsconfig node scoping, ARIA panels). Full suite, lint, typecheck, build green; CI green on the PR.
