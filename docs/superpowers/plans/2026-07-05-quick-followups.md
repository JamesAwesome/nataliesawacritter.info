# Quick Followups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the ten approved followups from `docs/superpowers/specs/2026-07-05-quick-followups-design.md` — two a11y/UX, four hardening, four code-health — each with its own test.

**Architecture:** Five independent tasks grouped by file locality: (1) keyboard-operable photo pickers via a visually-hidden-input class; (2) App sheet self-healing (pure `sheetIsValid` + effect) and the onUploadPhoto wiring test; (3) server hardening (nosniff header, cause-walk depth cap); (4) deterministic emoji tiebreak + bar-width rounding; (5) FRIEND_MESSAGES hoist, PickerTile extraction, fixture id separation. No behavior changes outside items 1–3.

**Tech Stack:** existing stack; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-05-quick-followups-design.md`

## Global Constraints

- pnpm 11.9.0 from `app/`; raw vitest needs `NODE_OPTIONS=--no-experimental-webstorage`; server imports `.js`; no raw hexes in TSX.
- DOM and rendered copy identical everywhere except: photo-picker inputs become focusable (item 1), the photo GET gains `X-Content-Type-Options: nosniff` (item 3), bar widths round to 2 decimals (item 6).
- FROZEN byte-unchanged: `app/src/components/LogSightingFlow.test.tsx`, `app/src/components/DetailsForm.test.tsx`.
- Fixture ids after Task 5: `makeSighting` keeps `00000000-0000-4000-8000-…`, `makeProfile` becomes `00000000-0000-4000-9000-…`.
- Existing test suites must stay green untouched except where a task names an edit.

---

### Task 1: Keyboard-operable photo pickers

**Files:**
- Modify: `app/src/index.css` (replace the two `display: none` input rules; add `.visually-hidden-input` + focus ring), `app/src/components/PhotoControl.tsx`, `app/src/components/SightingDetail.tsx`
- Test: `app/src/components/PhotoControl.test.tsx` (append), `app/src/components/SightingDetail.test.tsx` (append)

**Interfaces:**
- Produces: `.visually-hidden-input` utility class; both file inputs carry it; labels get a `:focus-within` outline. No prop/DOM-structure changes.

- [ ] **Step 1: Write the failing tests**

Append to `PhotoControl.test.tsx` (imports `readFileSync` from 'node:fs' and `path` — the CSS sync-guard pattern used by the breakpoint test):

```tsx
describe('keyboard access', () => {
  it('the file input is visually hidden, not display:none', () => {
    render(<PhotoControl photo={null} onPhoto={vi.fn()} />)
    const input = screen.getByLabelText(/add a photo/i)
    expect(input).toHaveClass('visually-hidden-input')
    const css = readFileSync(path.resolve(__dirname, '../index.css'), 'utf8')
    const block = css.split('.visually-hidden-input')[1]?.split('}')[0] ?? ''
    expect(block).toContain('clip-path')
    expect(block).not.toContain('display: none')
  })
})
```

Append to `SightingDetail.test.tsx`'s photo describe:

```tsx
  it('the replace input is visually hidden, not display:none', () => {
    renderDetail({ sighting: makeSighting({ photoPath: '/api/photos/a-1.jpg' }) })
    expect(screen.getByLabelText('Replace photo')).toHaveClass('visually-hidden-input')
  })
```

- [ ] **Step 2: Run to verify failure**

Run (from `app/`): `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client`
Expected: both FAIL (class absent).

- [ ] **Step 3: Implement**

`app/src/index.css` — DELETE the rules `.photo-add input { display: none; }` and `.photo-action input { display: none; }`; append:

```css
/* Focusable but invisible: keeps file inputs in the tab order (a11y) while
   the styled label supplies the visuals. */
.visually-hidden-input {
  position: absolute;
  width: 1px;
  height: 1px;
  clip-path: inset(50%);
  overflow: hidden;
  white-space: nowrap;
  opacity: 0;
}

.photo-add,
.photo-action {
  position: relative;
}

.photo-add:focus-within,
.photo-action:focus-within {
  outline: 2px solid var(--other-text);
  outline-offset: 2px;
}
```

`PhotoControl.tsx`: add `className="visually-hidden-input"` to the `<input type="file">`.
`SightingDetail.tsx`: add `className="visually-hidden-input"` to the Replace `<input type="file">`.

- [ ] **Step 4: Verify pass, lint, typecheck, frozen check, commit**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client && pnpm lint && pnpm typecheck`
Expected: green; `git status` shows frozen files untouched.

```bash
git add app/src/index.css app/src/components/PhotoControl.tsx app/src/components/SightingDetail.tsx app/src/components/PhotoControl.test.tsx app/src/components/SightingDetail.test.tsx
git commit -m "fix: photo pickers reachable by keyboard (visually-hidden inputs)"
```

---

### Task 2: App — sheet self-healing + onUploadPhoto wiring test

**Files:**
- Modify: `app/src/App.tsx`
- Create: `app/src/lib/sheet.ts`
- Test: `app/src/lib/sheet.test.ts`, `app/src/App.test.tsx` (append)

**Interfaces:**
- Produces: `sheetIsValid(sheet, sightings): boolean` in `lib/sheet.ts` — false ONLY for a `{kind:'sighting'}` sheet whose id is absent from `sightings`; true for null/log/day and resolvable sighting sheets. App gains a healing effect calling `setSheet(null)` when invalid. `SheetState` type moves to (or is re-exported from) `lib/sheet.ts` so the helper and App share it.

- [ ] **Step 1: Write the failing unit tests**

`app/src/lib/sheet.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { makeSighting } from '../test/helpers'
import { sheetIsValid } from './sheet'

const ROW = makeSighting()

describe('sheetIsValid', () => {
  it('accepts null, log, and day sheets regardless of data', () => {
    expect(sheetIsValid(null, [])).toBe(true)
    expect(sheetIsValid({ kind: 'log' }, [])).toBe(true)
    expect(sheetIsValid({ kind: 'day', date: '2026-07-01' }, [])).toBe(true)
  })

  it('accepts a sighting sheet whose id resolves', () => {
    expect(sheetIsValid({ kind: 'sighting', id: ROW.id }, [ROW])).toBe(true)
  })

  it('rejects a sighting sheet whose id is gone', () => {
    expect(sheetIsValid({ kind: 'sighting', id: ROW.id }, [])).toBe(false)
  })
})
```

- [ ] **Step 2: Verify failure, implement lib/sheet.ts**

`app/src/lib/sheet.ts` (move the `SheetState` union OUT of App.tsx verbatim — copy its exact current shape from App.tsx, including `fromDay?`):

```ts
import type { Sighting } from '../api'

export type SheetState =
  | null
  | { kind: 'log' }
  | { kind: 'day'; date: string }
  | { kind: 'sighting'; id: string; fromDay?: string }

/** A sheet is stale only when it points at a sighting that no longer exists. */
export function sheetIsValid(sheet: SheetState, sightings: Sighting[]): boolean {
  if (sheet === null || sheet.kind !== 'sighting') return true
  return sightings.some((s) => s.id === sheet.id)
}
```

(If App.tsx's actual `SheetState` differs in any member shape, the MOVED type wins — transcribe App's exact union; the test only exercises the three kinds above.)

`App.tsx`: delete the local `SheetState` type, import it and `sheetIsValid` from './lib/sheet'; add after the sheet state declaration:

```tsx
  // Self-heal: a detail sheet pointing at a vanished sighting closes instead
  // of lingering as stale state (the render guard already draws nothing).
  useEffect(() => {
    if (!sheetIsValid(sheet, sightings)) setSheet(null)
  }, [sheet, sightings])
```

- [ ] **Step 3: Append the App wiring test (spec item 10)**

Append to `App.test.tsx` (uses `stubFetchByUrl`, `makeSighting`, `setCredentials`; add a hoisted `downscalePhoto` mock at the top of the file — `vi.mock('./lib/photo', ...)` — ONLY if the file doesn't already mock it):

```tsx
  it('logging with a photo PUTs it and applies the returned row', async () => {
    setCredentials('sekrit')
    const created = makeSighting({ emoji: '🦊', name: 'Fox' })
    const withPhoto = { ...created, photoPath: `/api/photos/${created.id}-1.jpg` }
    downscalePhoto.mockResolvedValueOnce(new Blob(['x'], { type: 'image/jpeg' }))
    stubFetchByUrl({
      '/api/sightings': [
        { status: 200, body: [] },
        { status: 201, body: created },
        { status: 200, body: withPhoto }, // the PUT response
      ],
      '/api/profiles': [{ status: 200, body: [] }],
    })
    render(<App />)
    await userEvent.click(screen.getAllByRole('button', { name: /log a sighting/i })[0])
    await userEvent.click(screen.getByRole('button', { name: 'Fox' }))
    await userEvent.upload(screen.getByLabelText(/add a photo/i), new File(['p'], 'p.jpg', { type: 'image/jpeg' }))
    await screen.findByText('✓ Photo added')
    await userEvent.click(screen.getByRole('button', { name: /save sighting/i }))
    await screen.findByText('🎉 Logged!')
    // applySighting ran: opening the detail shows the served photo
    await userEvent.click(screen.getByText('Fox'))
    expect(await screen.findByRole('img')).toHaveAttribute('src', withPhoto.photoPath)
  })
```

(If the Recent-Critters row query `getByText('Fox')` is ambiguous with the picker tile, scope it: `within(screen.getByRole('list', ...))` or use the row's aria — adapt the QUERY only, never the assertions on PUT/photoPath.)

- [ ] **Step 4: Full client run, lint, typecheck, commit**

```bash
NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client && pnpm lint && pnpm typecheck
git add app/src/lib/sheet.ts app/src/lib/sheet.test.ts app/src/App.tsx app/src/App.test.tsx
git commit -m "fix: close stale sighting sheets; cover photo wiring at the App level"
```

---

### Task 3: Server hardening — nosniff + cause-walk depth cap

**Files:**
- Modify: `app/server/sightings/photoRoutes.ts`, `app/server/profiles/store.ts`
- Test: `app/server/sightings/photoRoutes.test.ts` (extend one assertion), `app/server/profiles/isUniqueViolation.test.ts` (create)

**Interfaces:**
- Produces: photo GET responses carry `X-Content-Type-Options: nosniff`; `isUniqueViolation` exported from `profiles/store.ts` with a depth cap of 8.

- [ ] **Step 1: Extend the GET test + write the cycle test (both failing)**

In `photoRoutes.test.ts`, in `'serves the file with immutable caching'`, add after the cache-control assertion:

```ts
      expect(res.headers.get('x-content-type-options')).toBe('nosniff')
```

`app/server/profiles/isUniqueViolation.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { isUniqueViolation } from './store.js'

describe('isUniqueViolation', () => {
  it('finds 23505 through wrapped causes', () => {
    expect(isUniqueViolation({ cause: { cause: { code: '23505' } } })).toBe(true)
    expect(isUniqueViolation({ code: '42P01' })).toBe(false)
  })

  it('terminates on a cyclic cause chain', () => {
    const cyclic: { code: string; cause?: unknown } = { code: '42P01' }
    cyclic.cause = cyclic
    expect(isUniqueViolation(cyclic)).toBe(false)
  })
})
```

Run: `pnpm vitest run --project unit` → nosniff assertion FAILS; cycle test HANGS or fails on import (isUniqueViolation not exported) — if it hangs, that's the bug proving itself; kill and implement.

- [ ] **Step 2: Implement**

`photoRoutes.ts` GET handler — set the header before sendFile:

```ts
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.sendFile(filename, { root: photosDir, immutable: true, maxAge: '365d' }, (err) => {
```

`profiles/store.ts` — export and cap:

```ts
/** Postgres unique-violation is SQLSTATE 23505; drizzle may wrap the pg error,
 *  so walk causes — depth-capped so a cyclic chain can't spin. */
export function isUniqueViolation(err: unknown): boolean {
  let e = err
  for (let depth = 0; depth < 8 && typeof e === 'object' && e !== null; depth += 1) {
    if ((e as { code?: unknown }).code === '23505') return true
    e = (e as { cause?: unknown }).cause
  }
  return false
}
```

(remove the old inner `function isUniqueViolation` — the export replaces it at module scope; call sites unchanged.)

- [ ] **Step 3: Unit + integration, lint, typecheck, commit**

```bash
pnpm vitest run --project unit && pnpm vitest run --project integration && pnpm lint && pnpm typecheck
git add app/server/sightings/photoRoutes.ts app/server/sightings/photoRoutes.test.ts app/server/profiles/store.ts app/server/profiles/isUniqueViolation.test.ts
git commit -m "fix: nosniff on photo GET; depth-cap the unique-violation cause walk"
```

---

### Task 4: Emoji tiebreak + bar-width rounding

**Files:**
- Modify: `app/src/lib/insights.ts`, `app/src/components/LeaderboardList.tsx`
- Test: `app/src/lib/insights.test.ts` (append), `app/src/components/LeaderboardList.test.tsx` (append)

**Interfaces:**
- Produces: `leaderboard`'s final tiebreak compares full codepoint sequences (deterministic, locale-free); bar widths rendered as `Math.round(width * 100) / 100`.

- [ ] **Step 1: Append failing tests**

`insights.test.ts` (inside the leaderboard describe; `makeSighting` already imported). The pair must DIVERGE between comparators: `'�'` (U+FFFD, one UTF-16 unit 0xFFFD) vs `'😀'` (U+1F600, leading surrogate 0xD83D). UTF-16 `<` puts 😀 first (0xD83D < 0xFFFD); codepoint order puts � first (65533 < 128512) — so this test FAILS under the current comparator and passes after the fix. Both rows: count 1, identical createdAt → only the emoji tiebreak decides:

```ts
  it('tiebreaks by codepoint order, not UTF-16 units', () => {
    const rows = leaderboard([
      makeSighting({ emoji: '😀', createdAt: '2026-07-01T00:00:00.000Z' }),
      makeSighting({ emoji: '�', createdAt: '2026-07-01T00:00:00.000Z' }),
    ])
    expect(rows.map((r) => r.emoji)).toEqual(['�', '😀'])
  })
```

`LeaderboardList.test.tsx`:

```tsx
  it('rounds bar widths to two decimals', () => {
    render(<LeaderboardList rows={[{ emoji: '🦊', count: 3 }, { emoji: '🦉', count: 1 }]} />)
    const fills = document.querySelectorAll<HTMLElement>('.leader-bar-fill')
    expect(fills[1].style.width).toBe('33.33%')
  })
```

- [ ] **Step 2: Verify both fail, implement**

`insights.ts` — add above `leaderboard`:

```ts
/** Deterministic, locale-free emoji order: full codepoint sequences. */
function compareEmoji(a: string, b: string): number {
  const as = Array.from(a)
  const bs = Array.from(b)
  for (let i = 0; i < Math.min(as.length, bs.length); i += 1) {
    const diff = (as[i].codePointAt(0) ?? 0) - (bs[i].codePointAt(0) ?? 0)
    if (diff !== 0) return diff
  }
  return as.length - bs.length
}
```

and replace the final tiebreak term `(a.emoji < b.emoji ? -1 : a.emoji > b.emoji ? 1 : 0)` with `compareEmoji(a.emoji, b.emoji)`.

`LeaderboardList.tsx` — `const width = Math.round(Math.max(8, (row.count / max) * 100) * 100) / 100`.

- [ ] **Step 3: Verify pass, lint, typecheck, commit**

```bash
NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client && pnpm lint && pnpm typecheck
git add app/src/lib/insights.ts app/src/lib/insights.test.ts app/src/components/LeaderboardList.tsx app/src/components/LeaderboardList.test.tsx
git commit -m "fix: codepoint-deterministic leaderboard tiebreak; rounded bar widths"
```

---

### Task 5: Code health — FRIEND_MESSAGES, PickerTile, fixture ids

**Files:**
- Modify: `app/src/components/SightingDetail.tsx`, `app/src/components/EmojiPicker.tsx`, `app/src/test/helpers.tsx`
- Test: existing suites prove all three (no new tests; `helpers` change verified by the whole client project staying green)

**Interfaces:**
- Produces: module-level `const FRIEND_MESSAGES = { disabled: 'Saving is disabled right now', failed: "Couldn't save — try again" }` in SightingDetail used at both friend call sites; internal `PickerTile` component in EmojiPicker.tsx rendering identical DOM for all four tile rows; `makeProfile` ids `00000000-0000-4000-9000-…`.

- [ ] **Step 1: FRIEND_MESSAGES**

In `SightingDetail.tsx`, add next to `PHOTO_MESSAGES` (module scope or component scope matching PHOTO_MESSAGES' current placement):

```ts
const FRIEND_MESSAGES = { disabled: 'Saving is disabled right now', failed: "Couldn't save — try again" }
```

and pass `FRIEND_MESSAGES` as the third arg at BOTH friend `write.run` call sites (replacing the two inline object literals — strings must remain byte-identical).

- [ ] **Step 2: PickerTile**

In `EmojiPicker.tsx`, add above the component (extend the react import: `import { useState, type ReactNode } from 'react'`):

```tsx
type TileProps = {
  className?: string
  ariaLabel?: string
  tint?: string
  onClick: () => void
  children: ReactNode
}

function PickerTile({ className, ariaLabel, tint, onClick, children }: TileProps) {
  return (
    <button
      type="button"
      className={className === undefined ? 'picker-tile' : `picker-tile ${className}`}
      style={tint === undefined ? undefined : { background: tint }}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
```

Replace all four tile renderings:
- Friends: `<PickerTile key={profile.id} className="friend-tile" ariaLabel={\`Friend ${profile.name}\`} onClick={() => onPickFriend?.(profile)}><span aria-hidden="true">{profile.emoji}</span><span className="friend-name">{profile.name}</span></PickerTile>`
- Recent: `<PickerTile key={emoji} ariaLabel={\`Recently seen ${nameFor(emoji) ?? emoji}\`} onClick={() => onPick(emoji, nameFor(emoji))}>{emoji}</PickerTile>`
- Curated: `<PickerTile key={c.emoji} tint={c.tint} ariaLabel={c.name} onClick={() => onPick(c.emoji, c.name)}>{c.emoji}</PickerTile>`
- Extended: `<PickerTile key={emoji} ariaLabel={emoji} onClick={() => onPick(emoji, null)}>{emoji}</PickerTile>`

The "Other" button stays a plain `<button>` (different semantics: no aria-label, its own class). Rendered DOM must be identical — the existing EmojiPicker tests prove it.

- [ ] **Step 3: Fixture ids**

In `test/helpers.tsx`, change `makeProfile`'s id template to `` `00000000-0000-4000-9000-${String(profileSeq).padStart(12, '0')}` ``. (`makeSighting` unchanged.)

- [ ] **Step 4: Full client run, lint, typecheck, frozen check, commit**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client && pnpm lint && pnpm typecheck`
Expected: ALL existing tests green with zero test-file edits (that's the proof of DOM/behavior identity); frozen files untouched.

```bash
git add app/src/components/SightingDetail.tsx app/src/components/EmojiPicker.tsx app/src/test/helpers.tsx
git commit -m "refactor: FRIEND_MESSAGES const, PickerTile extraction, fixture id ranges"
```

---

### Final verification

- [ ] From `app/`: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — all green.
- [ ] Manual (post-merge or on the compose stack): Tab reaches "📷 Add a photo" and "Replace photo"; Enter opens the file dialog; focus ring visible.
- [ ] Frozen files byte-unchanged across the branch; CI green on the PR.
