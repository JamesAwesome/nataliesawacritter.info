# Top Critters Grouped by Name Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Top Critters leaderboard groups by the name Natalie gives each critter (per emoji) — "🐦 Cardinal — 5", "🐦 Blue Jay — 3" — so she can track counts per species. Per `docs/superpowers/specs/2026-07-06-leaderboard-by-name-design.md`.

**Architecture:** Client-side only. Task 1 changes the pure `leaderboard()` in `app/src/lib/insights.ts` to group by `(emoji, case-insensitive name)` and adds `name` to `LeaderRow`. Task 2 renders the name in `LeaderboardList`. No server, schema, or index change — aggregation stays in the browser over the already-fetched list. Both the sidebar top-10 and the Top Critters tab pick it up because they share `leaderboard()`.

**Tech Stack:** React 19, Vitest 4. **No new dependencies. No database change.**

**Spec:** `docs/superpowers/specs/2026-07-06-leaderboard-by-name-design.md`

## Global Constraints

- pnpm from `app/`; raw vitest needs `NODE_OPTIONS=--no-experimental-webstorage` prefix; no raw hex in TSX/CSS (use existing `--tint-*`/`--ink-*` tokens); no new dependencies.
- Group key: `` `${emoji} ${normalizedName(name ?? '')}` `` (`normalizedName` from `./critters` = trim + lowercase). Unnamed (null/empty/whitespace name) → `name: null`, grouped by emoji.
- `LeaderRow` = `{ emoji: string; name: string | null; count: number }`.
- Sort: `count desc → latest createdAt desc → emoji codepoint asc → name asc` (compare `name ?? ''` with deterministic `<`/`>`, NOT `localeCompare` — keep it locale-free like the existing `compareEmoji`).
- Display name follows the group's most-recent sighting's casing.
- `recentEmoji`/`filterByRange`/`TopCrittersPane`/`App` are unchanged.

---

### Task 1: group `leaderboard()` by emoji + name

**Files:**
- Modify: `app/src/lib/insights.ts`
- Test: `app/src/lib/insights.test.ts`

**Interfaces:**
- Consumes: `normalizedName` from `./critters`.
- Produces: `LeaderRow = { emoji: string; name: string | null; count: number }`; `leaderboard(sightings: Sighting[]): LeaderRow[]`. Task 2 renders these rows.

- [ ] **Step 1: Update the tests (RED)**

In `app/src/lib/insights.test.ts`, rewrite the first leaderboard test to the new row shape (use `name: null` so it reads as clean emoji grouping of unnamed sightings):

```ts
  it('counts by emoji for unnamed sightings, descending', () => {
    const rows = [
      makeSighting({ emoji: '🦊', name: null }),
      makeSighting({ emoji: '🦊', name: null }),
      makeSighting({ emoji: '🦉', name: null }),
    ]
    expect(leaderboard(rows)).toEqual([
      { emoji: '🦊', name: null, count: 2 },
      { emoji: '🦉', name: null, count: 1 },
    ])
  })
```

(The two tie-break tests and the empty test only assert `.map((r) => r.emoji)` / `[]`, so they keep passing unchanged — the added `name` field doesn't affect them.)

Append these name-grouping tests inside the `describe('leaderboard', …)` block:

```ts
  it('counts the same emoji under different names separately', () => {
    const rows = [
      makeSighting({ emoji: '🐦', name: 'Cardinal' }),
      makeSighting({ emoji: '🐦', name: 'Cardinal' }),
      makeSighting({ emoji: '🐦', name: 'Blue Jay' }),
    ]
    expect(leaderboard(rows)).toEqual([
      { emoji: '🐦', name: 'Cardinal', count: 2 },
      { emoji: '🐦', name: 'Blue Jay', count: 1 },
    ])
  })

  it('merges names case-insensitively', () => {
    const rows = [
      makeSighting({ emoji: '🐦', name: 'Cardinal' }),
      makeSighting({ emoji: '🐦', name: 'cardinal' }),
      makeSighting({ emoji: '🐦', name: '  CARDINAL  ' }),
    ]
    const result = leaderboard(rows)
    expect(result).toHaveLength(1)
    expect(result[0].count).toBe(3)
    expect(result[0].emoji).toBe('🐦')
  })

  it('groups unnamed sightings by emoji with a null name', () => {
    const rows = [
      makeSighting({ emoji: '🐦', name: null }),
      makeSighting({ emoji: '🐦', name: 'Cardinal' }),
    ]
    expect(leaderboard(rows)).toEqual([
      { emoji: '🐦', name: null, count: 1 },
      { emoji: '🐦', name: 'Cardinal', count: 1 },
    ])
  })

  it("uses the most-recent sighting's casing as the display name", () => {
    const rows = [
      makeSighting({ emoji: '🐦', name: 'cardinal', createdAt: '2026-07-01T00:00:00.000Z' }),
      makeSighting({ emoji: '🐦', name: 'Cardinal', createdAt: '2026-07-05T00:00:00.000Z' }),
    ]
    expect(leaderboard(rows)[0].name).toBe('Cardinal')
  })

  it('breaks a full tie (count, latest, emoji) by name ascending', () => {
    const rows = [
      makeSighting({ emoji: '🐦', name: 'Cardinal', createdAt: '2026-07-05T00:00:00.000Z' }),
      makeSighting({ emoji: '🐦', name: 'Blue Jay', createdAt: '2026-07-05T00:00:00.000Z' }),
    ]
    expect(leaderboard(rows).map((r) => r.name)).toEqual(['Blue Jay', 'Cardinal'])
  })
```

- [ ] **Step 2: Run to verify failure**

Run (from `app/`): `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client src/lib/insights.test.ts`
Expected: FAIL — rows lack `name`; names not grouped.

- [ ] **Step 3: Implement the grouping**

In `app/src/lib/insights.ts`, add the import at the top (next to the `Sighting` import):

```ts
import { normalizedName } from './critters'
```

Change the `LeaderRow` type:

```ts
export type LeaderRow = { emoji: string; name: string | null; count: number }
```

Replace `leaderboard` with:

```ts
/** Groups by (emoji, case-insensitive name); unnamed sightings group by emoji
 *  with a null name. Sort: count desc, then that group's most-recent createdAt
 *  desc, then emoji codepoint asc, then display name asc. Display name follows
 *  the most-recent sighting's casing. */
export function leaderboard(sightings: Sighting[]): LeaderRow[] {
  const groups = new Map<string, { emoji: string; name: string | null; count: number; latest: string }>()
  for (const s of sightings) {
    const norm = normalizedName(s.name ?? '')
    const key = `${s.emoji} ${norm}`
    const display = norm === '' ? null : s.name
    const g = groups.get(key)
    if (g === undefined) {
      groups.set(key, { emoji: s.emoji, name: display, count: 1, latest: s.createdAt })
    } else {
      g.count += 1
      if (s.createdAt > g.latest) {
        g.latest = s.createdAt
        g.name = display // display name follows the most-recent sighting's casing
      }
    }
  }
  return [...groups.values()]
    .sort(
      (a, b) =>
        b.count - a.count ||
        (a.latest < b.latest ? 1 : a.latest > b.latest ? -1 : 0) ||
        compareEmoji(a.emoji, b.emoji) ||
        ((a.name ?? '') < (b.name ?? '') ? -1 : (a.name ?? '') > (b.name ?? '') ? 1 : 0),
    )
    .map(({ emoji, name, count }) => ({ emoji, name, count }))
}
```

(`compareEmoji` already exists above `leaderboard` in this file.)

- [ ] **Step 4: Run to verify pass**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client src/lib/insights.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/insights.ts src/lib/insights.test.ts
git commit -m "feat: group the leaderboard by emoji and name"
```

---

### Task 2: render the name in `LeaderboardList`

**Files:**
- Modify: `app/src/components/LeaderboardList.tsx`, `app/src/index.css`
- Test: `app/src/components/LeaderboardList.test.tsx`

**Interfaces:**
- Consumes: `LeaderRow = { emoji, name, count }` (Task 1).
- Produces: no new exports — `LeaderboardList` renders the name.

- [ ] **Step 1: Update the tests (RED)**

In `app/src/components/LeaderboardList.test.tsx`, add `name` to the shared `ROWS` and to the inline row literals (the `LeaderRow` type now requires it), and add a named-row test.

Change `ROWS`:

```ts
const ROWS: LeaderRow[] = [
  { emoji: '🦊', name: null, count: 10 },
  { emoji: '🦉', name: null, count: 5 },
  { emoji: '🐸', name: null, count: 3 },
  { emoji: '🐢', name: null, count: 1 },
]
```

In the two bar-width tests, add `name: null` to each inline row — e.g.
`rows={[{ emoji: '🦊', name: null, count: 100 }, { emoji: '🐢', name: null, count: 1 }]}`
and `rows={[{ emoji: '🦊', name: null, count: 3 }, { emoji: '🦉', name: null, count: 1 }]}`.

Append a named-row test:

```ts
  it('shows the name for a named row and only the emoji for an unnamed one', () => {
    render(
      <LeaderboardList
        rows={[
          { emoji: '🐦', name: 'Cardinal', count: 5 },
          { emoji: '🦊', name: null, count: 2 },
        ]}
      />,
    )
    const items = screen.getAllByRole('listitem')
    expect(within(items[0]).getByText('Cardinal')).toBeInTheDocument()
    expect(items[0]).toHaveAttribute('aria-label', 'Rank 1: Cardinal, 5 sightings')
    // unnamed row: no extra name text, aria falls back to the curated name
    expect(within(items[1]).queryByText('Cardinal')).not.toBeInTheDocument()
    expect(items[1]).toHaveAttribute('aria-label', 'Rank 2: Fox, 2 sightings')
  })
```

- [ ] **Step 2: Run to verify failure**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client src/components/LeaderboardList.test.tsx`
Expected: FAIL — no name text rendered; aria-label lacks the name.

- [ ] **Step 3: Implement the display**

In `app/src/components/LeaderboardList.tsx`, update the row: change the `key`, add the name span, and use the name in the aria-label. Replace the `<li …>` opening and the emoji span region:

```tsx
          <li
            key={`${row.emoji} ${row.name ?? ''}`}
            className="leader-row"
            aria-label={`Rank ${i + 1}: ${row.name ?? nameFor(row.emoji) ?? row.emoji}, ${row.count} sighting${row.count === 1 ? '' : 's'}`}
          >
            <span className="leader-rank">{i < 3 ? MEDALS[i] : `#${i + 1}`}</span>
            <span className="leader-emoji" aria-hidden="true">
              {row.emoji}
            </span>
            {row.name !== null && <span className="leader-name">{row.name}</span>}
            <span className="leader-bar-track">
              <span className="leader-bar-fill" style={{ width: `${width}%`, background: gradient }} />
            </span>
            <span className="leader-count">{row.count}</span>
          </li>
```

(Everything else in the component is unchanged; `nameFor` is already imported.)

- [ ] **Step 4: Add the CSS**

Append to `app/src/index.css` (near the other `.leader-*` rules):

```css
.leader-name {
  font-size: 12px;
  color: var(--ink-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 84px;
  flex-shrink: 0;
}
```

- [ ] **Step 5: Run to verify pass**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client src/components/LeaderboardList.test.tsx`
Expected: all PASS.

- [ ] **Step 6: Full verification**

Run: `pnpm test && pnpm lint && pnpm typecheck && pnpm build`
Expected: all green (integration needs Docker). `App`/`TopCrittersPane` pass the rows through unchanged, so their tests are unaffected.

- [ ] **Step 7: Commit**

```bash
git add src/components/LeaderboardList.tsx src/components/LeaderboardList.test.tsx src/index.css
git commit -m "feat: show the critter name in the Top Critters list"
```
