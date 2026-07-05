# Friend Highlighting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ⭐ marks friend sightings on every SightingRow, and History gains a "⭐ Friends" toggle chip composing with the date range, per `docs/superpowers/specs/2026-07-05-friend-highlighting-design.md`.

**Architecture:** One shared predicate (`lib/friends.ts`: `friendKeys` Set built once per profiles change + `isFriendSighting`), an optional `starred` prop on SightingRow (aria-hidden ⭐ + visually-hidden ", friend"), and threading from App (memoized key set) to the three row-rendering panes. HistoryPane owns the chip state and applies the friend filter after the untouched `filterByRange`.

**Tech Stack:** existing stack; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-05-friend-highlighting-design.md`

## Global Constraints

- pnpm 11.9.0 from `app/`; raw vitest needs `NODE_OPTIONS=--no-experimental-webstorage`; no raw hexes in TSX (chip uses existing tokens).
- Key separator is the literal NUL character (write `'\u0000'` in code): emoji is free-text server-side and names contain spaces — NUL is the one character neither carries.
- Copy exact: chip label `⭐ Friends`; friends-empty state `No friend sightings here 😿`; the two existing History empty messages unchanged; visually-hidden row suffix `, friend`.
- `filterByRange` stays byte-untouched. SightingRow with `starred` absent/false renders byte-identical DOM to today.
- FROZEN byte-unchanged: `app/src/components/LogSightingFlow.test.tsx`, `app/src/components/DetailsForm.test.tsx`.

---

### Task 1: lib/friends predicate

**Files:**
- Create: `app/src/lib/friends.ts`
- Test: `app/src/lib/friends.test.ts`

**Interfaces:**
- Consumes: `normalizedName` from `./critters`; `Profile`/`Sighting` types from `../api`.
- Produces (Tasks 2–4 rely on):

```ts
export function friendKeys(profiles: Profile[]): Set<string>
export function isFriendSighting(sighting: Sighting, keys: Set<string>): boolean
```

- [ ] **Step 1: Write the failing tests**

`app/src/lib/friends.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { makeProfile, makeSighting } from '../test/helpers'
import { friendKeys, isFriendSighting } from './friends'

describe('friendKeys / isFriendSighting', () => {
  it('matches by emoji + case/whitespace-insensitive name', () => {
    const keys = friendKeys([makeProfile({ emoji: '🦊', name: 'Mr Fox' })])
    expect(isFriendSighting(makeSighting({ emoji: '🦊', name: 'mr fox' }), keys)).toBe(true)
    expect(isFriendSighting(makeSighting({ emoji: '🦊', name: '  MR FOX  ' }), keys)).toBe(true)
  })

  it('requires the emoji to match too', () => {
    const keys = friendKeys([makeProfile({ emoji: '🦊', name: 'Mr Fox' })])
    expect(isFriendSighting(makeSighting({ emoji: '🐺', name: 'Mr Fox' }), keys)).toBe(false)
  })

  it('never matches nameless sightings', () => {
    const keys = friendKeys([makeProfile({ emoji: '🦊', name: 'Mr Fox' })])
    expect(isFriendSighting(makeSighting({ emoji: '🦊', name: null }), keys)).toBe(false)
  })

  it('empty profiles produce an empty set', () => {
    expect(friendKeys([]).size).toBe(0)
  })

  it('the NUL separator prevents cross-field collisions', () => {
    // profile (emoji '🦊 x', name 'y') must NOT match sighting (emoji '🦊', name 'x y')
    const keys = friendKeys([makeProfile({ emoji: '🦊 x', name: 'y' })])
    expect(isFriendSighting(makeSighting({ emoji: '🦊', name: 'x y' }), keys)).toBe(false)
  })
})
```

- [ ] **Step 2: Verify failure, implement**

Run (from `app/`): `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client` → FAIL (module missing).

`app/src/lib/friends.ts`:

```ts
import type { Profile, Sighting } from '../api'
import { normalizedName } from './critters'

// NUL separator: emoji is a free-text field server-side and names contain
// spaces — NUL is the one character neither will ever carry.
const SEP = '\u0000'

/** One key per friend profile; build once per profiles change and reuse. */
export function friendKeys(profiles: Profile[]): Set<string> {
  return new Set(profiles.map((p) => p.emoji + SEP + normalizedName(p.name)))
}

/** A sighting is a friend sighting when a profile matches by emoji + normalized name. */
export function isFriendSighting(sighting: Sighting, keys: Set<string>): boolean {
  if (sighting.name === null) return false
  return keys.has(sighting.emoji + SEP + normalizedName(sighting.name))
}
```

- [ ] **Step 3: Verify pass, lint, typecheck, commit**

```bash
NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client && pnpm lint && pnpm typecheck
git add app/src/lib/friends.ts app/src/lib/friends.test.ts
git commit -m "feat: shared friend-sighting predicate"
```

---

### Task 2: SightingRow starred prop

**Files:**
- Modify: `app/src/components/SightingRow.tsx`, `app/src/index.css`
- Test: `app/src/components/SightingRow.test.tsx` (append; create the file if it doesn't exist — check first, some row coverage may live in pane tests)

**Interfaces:**
- Produces: `SightingRow` props gain `starred?: boolean` (default false → byte-identical DOM). When true: aria-hidden ⭐ plus visually-hidden `, friend` after the name. New generic `.visually-hidden` CSS class (text variant of the existing `.visually-hidden-input`).

- [ ] **Step 1: Write the failing tests**

Locate/create `app/src/components/SightingRow.test.tsx` (imports: render/screen from @testing-library/react, describe/expect/it/vi from vitest, makeSighting from '../test/helpers', SightingRow). Add:

```tsx
describe('starred', () => {
  it('renders the star and the accessible friend suffix when starred', () => {
    render(
      <ul>
        <SightingRow sighting={makeSighting({ name: 'Mr Fox' })} starred onSelect={vi.fn()} />
      </ul>,
    )
    expect(screen.getByRole('button', { name: /Mr Fox.*, friend/ })).toBeInTheDocument()
    expect(screen.getByText('⭐')).toHaveAttribute('aria-hidden', 'true')
  })

  it('renders no star artifacts by default', () => {
    render(
      <ul>
        <SightingRow sighting={makeSighting({ name: 'Mr Fox' })} onSelect={vi.fn()} />
      </ul>,
    )
    expect(screen.queryByText('⭐')).not.toBeInTheDocument()
    expect(screen.queryByText(', friend')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Verify failure, implement**

`SightingRow.tsx` — props gain `starred?: boolean`; the name span becomes:

```tsx
        <span className="recent-name">
          {sighting.name ?? sighting.emoji}
          {starred === true && (
            <>
              <span className="row-star" aria-hidden="true">⭐</span>
              <span className="visually-hidden">, friend</span>
            </>
          )}
        </span>
```

`index.css` — append:

```css
.row-star {
  font-size: 11px;
  margin-left: 4px;
}

/* Text sibling of .visually-hidden-input: present to assistive tech, invisible. */
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  clip-path: inset(50%);
  overflow: hidden;
  white-space: nowrap;
}
```

- [ ] **Step 3: Full client run (all existing row-rendering tests byte-unchanged and green — the default-path identity proof), lint, typecheck, commit**

```bash
NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client && pnpm lint && pnpm typecheck
git add app/src/components/SightingRow.tsx app/src/components/SightingRow.test.tsx app/src/index.css
git commit -m "feat: starred variant of SightingRow"
```

---

### Task 3: History "⭐ Friends" chip

**Files:**
- Modify: `app/src/components/HistoryPane.tsx`, `app/src/index.css`
- Test: `app/src/components/HistoryPane.test.tsx` (append)

**Interfaces:**
- Consumes: `friendKeys` Set shape + `isFriendSighting` (Task 1), `starred` (Task 2).
- Produces: `HistoryPane` props gain `friendKeys: Set<string>` (REQUIRED — Task 4 threads it; existing HistoryPane tests get the mechanical `friendKeys={new Set()}` or a populated set where the test needs it — additive prop in each render call, assertions untouched).

- [ ] **Step 1: Append the failing tests**

In `HistoryPane.test.tsx` (its render helper/calls gain the `friendKeys` prop; existing assertions untouched). Add:

```tsx
describe('friends filter', () => {
  const FOX = makeSighting({ emoji: '🦊', name: 'Mr Fox', sightedOn: '2026-07-01' })
  const OWL = makeSighting({ emoji: '🦉', name: 'Prof Hoot', sightedOn: '2026-07-02' })
  const KEYS = friendKeys([makeProfile({ emoji: '🦊', name: 'mr fox' })])

  it('chip toggles aria-pressed and filters to friends', async () => {
    render(<HistoryPane sightings={[FOX, OWL]} onSelect={vi.fn()} friendKeys={KEYS} />)
    const chip = screen.getByRole('button', { name: '⭐ Friends' })
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Mr Fox')).toBeInTheDocument()
    expect(screen.queryByText('Prof Hoot')).not.toBeInTheDocument()
  })

  it('composes with the date range', async () => {
    render(<HistoryPane sightings={[FOX, OWL]} onSelect={vi.fn()} friendKeys={KEYS} />)
    await userEvent.click(screen.getByRole('button', { name: '⭐ Friends' }))
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-07-02' } })
    expect(screen.queryByText('Mr Fox')).not.toBeInTheDocument()
    expect(screen.getByText('No friend sightings here 😿')).toBeInTheDocument()
  })

  it('Clear appears for the chip alone and resets it with the dates', async () => {
    render(<HistoryPane sightings={[FOX, OWL]} onSelect={vi.fn()} friendKeys={KEYS} />)
    expect(screen.queryByText('Clear')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '⭐ Friends' }))
    await userEvent.click(screen.getByText('Clear'))
    expect(screen.getByRole('button', { name: '⭐ Friends' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('Prof Hoot')).toBeInTheDocument()
  })

  it('friend rows in History carry the star', () => {
    render(<HistoryPane sightings={[FOX, OWL]} onSelect={vi.fn()} friendKeys={KEYS} />)
    expect(screen.getByRole('button', { name: /Mr Fox.*, friend/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Prof Hoot/ })).not.toHaveAccessibleName(/, friend/)
  })
})
```

(Add `makeProfile`, `friendKeys` imports; `userEvent`/`fireEvent` as the file already uses.)

- [ ] **Step 2: Verify failure, implement**

`HistoryPane.tsx`:

```tsx
import { useMemo, useState } from 'react'
import type { Sighting } from '../api'
import { isFriendSighting } from '../lib/friends'
import { filterByRange } from '../lib/insights'
import { SightingRow } from './SightingRow'

type Props = { sightings: Sighting[]; onSelect: (id: string) => void; friendKeys: Set<string> }

export function HistoryPane({ sightings, onSelect, friendKeys }: Props) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [friendsOnly, setFriendsOnly] = useState(false)
  // Memoized: the pane stays mounted (hidden) on other tabs; only re-filter when
  // the sightings or a bound changes, not on every unrelated App re-render.
  const ranged = useMemo(() => filterByRange(sightings, from, to), [sightings, from, to])
  const filtered = useMemo(
    () => (friendsOnly ? ranged.filter((s) => isFriendSighting(s, friendKeys)) : ranged),
    [ranged, friendsOnly, friendKeys],
  )
  const hasFilter = from !== '' || to !== '' || friendsOnly
```

Filter row: after the To input (before the Clear button) add

```tsx
        <button
          type="button"
          className={friendsOnly ? 'friends-chip active' : 'friends-chip'}
          aria-pressed={friendsOnly}
          onClick={() => setFriendsOnly((v) => !v)}
        >
          ⭐ Friends
        </button>
```

Clear's onClick adds `setFriendsOnly(false)`. Empty-state branch becomes:

```tsx
      {sightings.length === 0 ? (
        <p className="muted">No critters logged yet 🐾</p>
      ) : filtered.length === 0 ? (
        <p className="muted">{friendsOnly ? 'No friend sightings here 😿' : 'No critters in that range 😿'}</p>
      ) : (
```

Rows: `<SightingRow key={s.id} sighting={s} onSelect={onSelect} starred={isFriendSighting(s, friendKeys)} />`.

`index.css`:

```css
.friends-chip {
  border: 1px solid var(--border-hairline);
  background: #fff;
  color: var(--ink-secondary);
  border-radius: 999px;
  padding: 6px 10px;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.friends-chip.active {
  background: var(--tint-yellow);
  color: var(--ink);
  border-color: var(--tint-yellow);
}
```

Existing HistoryPane tests: add `friendKeys={new Set<string>()}` to their renders (mechanical; assertions untouched).

- [ ] **Step 3: Full client run, lint, typecheck, commit**

```bash
NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client && pnpm lint && pnpm typecheck
git add app/src/components/HistoryPane.tsx app/src/components/HistoryPane.test.tsx app/src/index.css
git commit -m "feat: friends filter chip and starred rows in History"
```

---

### Task 4: Threading — RecentCritters, DayDetail, App

**Files:**
- Modify: `app/src/components/RecentCritters.tsx`, `app/src/components/DayDetail.tsx`, `app/src/App.tsx`
- Test: `app/src/App.test.tsx` (append), existing RecentCritters/DayDetail tests gain the mechanical prop

**Interfaces:**
- Consumes: everything above.
- Produces: `RecentCritters` and `DayDetail` props gain `friendKeys: Set<string>` (required); both pass `starred={isFriendSighting(s, friendKeys)}` to their rows. App: `const keys = useMemo(() => friendKeys(profiles), [profiles])`, threaded to both RecentCritters renders, HistoryPane, and DayDetail.

- [ ] **Step 1: Append the failing App test**

`App.test.tsx` (uses `stubFetchByUrl`, `makeSighting`, `makeProfile`):

```tsx
  it('stars friend sightings in Recent Critters and filters them in History', async () => {
    const fox = makeSighting({ emoji: '🦊', name: 'Mr Fox' })
    const owl = makeSighting({ emoji: '🦉', name: 'Prof Hoot' })
    stubFetchByUrl({
      '/api/sightings': [{ status: 200, body: [fox, owl] }],
      '/api/profiles': [{ status: 200, body: [makeProfile({ emoji: '🦊', name: 'Mr Fox' })] }],
    })
    render(<App />)
    const recent = screen.getAllByTestId('recent-critters')[0]
    expect(await within(recent).findByRole('button', { name: /Mr Fox.*, friend/ })).toBeInTheDocument()
    expect(within(recent).getByRole('button', { name: /Prof Hoot/ })).not.toHaveAccessibleName(/, friend/)
    await userEvent.click(screen.getByRole('tab', { name: /history/i }))
    await userEvent.click(screen.getByRole('button', { name: '⭐ Friends' }))
    const history = document.getElementById('pane-history')!
    expect(within(history).getByText('Mr Fox')).toBeInTheDocument()
    expect(within(history).queryByText('Prof Hoot')).not.toBeInTheDocument()
  })
```

(Adapt the tab query to how existing App tests switch tabs — reuse their idiom verbatim; assertions stay.)

- [ ] **Step 2: Implement threading**

- `RecentCritters.tsx`: Props + `friendKeys: Set<string>`; row gains `starred={isFriendSighting(s, friendKeys)}` (import from '../lib/friends').
- `DayDetail.tsx`: same pattern.
- `App.tsx`: `import { friendKeys } from './lib/friends'`; `const keys = useMemo(() => friendKeys(profiles), [profiles])` beside the other memos; pass `friendKeys={keys}` to BOTH RecentCritters renders, the HistoryPane render, and the DayDetail render.
- Existing RecentCritters/DayDetail/HistoryPane test renders gain `friendKeys={new Set<string>()}` mechanically (assertions untouched).

- [ ] **Step 3: Full gate, frozen check, commit**

```bash
NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client && pnpm lint && pnpm typecheck && pnpm test && pnpm build
git add app/src
git commit -m "feat: thread friend stars through recent, history, and day views"
```

`git status`: LogSightingFlow.test.tsx / DetailsForm.test.tsx untouched.

---

### Final verification

- [ ] From `app/`: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — green.
- [ ] Browser (compose stack): Mr Fox rows starred in Recent Critters, History, Day Detail (any casing); unnamed fox unstarred; ⭐ Friends chip filters, composes with dates, Clear resets all; friends-empty copy exact.
- [ ] Frozen files byte-unchanged; CI green on the PR.
