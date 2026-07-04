# History + Top Critters Cycle — Design Spec

**Date:** 2026-07-04
**Status:** Approved
**Depends on:** shell + log flow (PR #6), calendar cycle (PR #7), sightings API (PR #4)
**Design source:** docs/design/README.md §3 (History), §4 (Top Critters), Design Tokens

## Purpose

Fill the last two placeholder tabs so all three views are live, and make the emoji
picker smarter by surfacing recently-seen critters. History gives Natalie a
date-filterable flat list; Top Critters ranks her sightings and finally renders the
desktop sidebar's stubbed top-10 slot. A "Recently seen" row speeds up logging repeat
critters.

After this cycle, the only remaining product surface is photo upload.

## Decisions (alternatives considered)

| Decision | Choice | Alternatives rejected |
|---|---|---|
| Recently-seen UI | A "Recently seen" row ABOVE the untouched curated-12 grid in the picker | Reorder the Other list (shifting grid hurts muscle memory, only helps Other picks); both (more surface for little gain) |
| Recently-seen data | Derived from the in-memory `sightings` array (distinct emoji by `createdAt` desc) | localStorage (per-device, second source of truth) |
| History filtering | Client-side on the loaded array (`filterByRange`), consistent with calendar/leaderboard | Server from/to refetch (the API supports it, but the app's model is load-once-derive-many; a hobby-scale array needs no round-trip) |
| Leaderboard tie-break | count desc → most-recent sighting `createdAt` desc → emoji codepoint (total, deterministic order) | Count-only (nondeterministic row order on ties) |
| Recent-row semantics | "Recently seen" = when logged (`createdAt`), robust to back-dated `sightedOn` | Array-order reliance (a back-dated sighting logged today would sort low) |

## Cycle opener: polish/debt commit

Clears the deferred a11y/polish batch accumulated across the shell and calendar
cycles (recorded in the deferred-hardening memory):
- **Calendar today-ring:** gate `isToday` on `inMonth` in `lib/calendar.ts`'s `monthGrid`
  so a leading/trailing bleed-day equal to the real system date no longer renders both
  out-of-month dimming and the today border. Add a `monthGrid` test for it.
- **Tab ARIA:** render all three tab panels (the inactive two `hidden`) so each tab
  button's `aria-controls={'pane-' + id}` resolves to a real element. This cycle
  replaces two of those panels with real content anyway, so the change is natural.
- **Empty-date Save guard:** `DetailsForm`'s Save disabled when `sightedOn === ''`
  (a cleared native date input currently submits `''` → generic server 400). Add a test.
- **tsconfig:** scope `"node"` types out of `tsconfig.app.json` so Node globals don't
  typecheck in browser `src/` code; move the one test that needs `node:fs` (the
  breakpoint sync-guard) to whatever config keeps it green, or add a narrow test
  tsconfig — implementer picks the smaller diff.
- **SightingDetail 401 test:** add a component-level test for the delete 401 →
  password-prompt path (currently only covered at the `useWriteAction` hook level).

## Derivation library

Pure, unit-tested functions consuming the `Sighting[]` the client already holds.
New file `app/src/lib/insights.ts` (name chosen to avoid crowding `calendar.ts`):

```ts
import type { Sighting } from '../api'

// Inclusive on both bounds; either may be undefined/'' for open-ended.
// Compares sightedOn (YYYY-MM-DD) lexicographically (valid for ISO dates).
export function filterByRange(sightings: Sighting[], from?: string, to?: string): Sighting[]

export type LeaderRow = { emoji: string; count: number }
// Grouped by emoji; count desc, then that emoji's most-recent createdAt desc,
// then emoji codepoint asc — a total, deterministic order.
export function leaderboard(sightings: Sighting[]): LeaderRow[]

// Distinct emoji ordered by most-recent createdAt desc, first `limit` kept.
// Sorts a copy by createdAt (robust to the array's incoming order).
export function recentEmoji(sightings: Sighting[], limit: number): string[]
```

`filterByRange` does NOT re-sort — it preserves the array's existing order (the API
returns `sightedOn` desc, `createdAt` desc), which is exactly History's "most-recent
first, by date then time" requirement.

## History tab (§3) — `HistoryPane`

Replaces the History placeholder. New `app/src/components/HistoryPane.tsx`,
`{ sightings: Sighting[]; onSelect(id: string): void }`; filter state (`from`/`to`)
is local to the pane.

- **Range filter** directly under the tab bar: two native `<input type="date">`
  (From / To, no labels, browser mm/dd/yyyy display) separated by a small "to", plus
  a "Clear" text button that renders only once `from` or `to` is set (clears both).
  Inclusive both ends; either bound may be empty.
- **List:** `filterByRange(sightings, from, to)` rendered as a flat, most-recent-first
  vertical list — each row is the existing `SightingRow` with `onSelect` (24px emoji,
  name-or-emoji, "Mon D · time", chevron) → opens Sighting Detail through App's sheet
  routing (`{kind:'sighting', id}`, no `fromDay` → Back closes). No date grouping.
- **Empty states:** no sightings at all → "No critters logged yet 🐾"; filter excludes
  everything → "No critters in that range 😿". On-brand, `.muted`.

Note: keeping every tab panel mounted means `HistoryPane` and `TopCrittersPane` re-run
their pure derivations on each `sightings` change even while hidden. At Natalie-scale
(hundreds–thousands of rows) this is negligible; if a panel's derivation ever became
costly it would move behind a `useMemo` or an active-tab guard, but neither is
warranted now (YAGNI).

## Top Critters tab (§4) — `LeaderboardList` + `TopCrittersPane`

Replaces the Top Critters placeholder AND fills the desktop sidebar's stubbed slot.
New `app/src/components/LeaderboardList.tsx`, `{ rows: LeaderRow[] }` — shared by both
the full tab and the sidebar preview (caller slices to 10 for the sidebar).

- Row layout: CSS grid `22px 28px 1fr auto` — rank marker · emoji · bar · count.
  - **Rank marker:** 🥇🥈🥉 for #1–3; plain "#4", "#5", … (13px 700 `--ink-tertiary`) beyond.
  - **Bar:** track `#EEF3FB` (new token `--bar-track`), height 10px, pill; filled
    `count/maxCount` with a **min 8% width** so count-1 critters stay visible; 2-stop
    gradient cycling the 7-stop rainbow array (index `i` and `i+2`, wrapping) so bars
    vary down the list.
  - **Count:** 14px 700 `--ink`, right-aligned.
  - Rows are **inert** (not tappable) per the handoff.
- **Full tab** (`TopCrittersPane`): uncapped `leaderboard(sightings)`; empty →
  "No critters logged yet 🐾".
- **Sidebar** (desktop ≥880px): the same list capped to the **top 10**, under a
  "Top Critters" heading, rendered in the existing `<aside>` beneath Recent Critters.
  Hidden (with its heading) when there are zero sightings.

## Recently seen emoji row

`EmojiPicker` (`app/src/components/EmojiPicker.tsx`) gains `recent: string[]` (the
last 6 distinct emoji). When non-empty, a "Recently seen" row renders ABOVE the
curated grid: each emoji a `.picker-tile` that calls `onPick(emoji, nameFor(emoji))`
— advancing to Step B exactly like a curated tile, name pre-filled when the emoji is
one of the curated 12, else `null`. Hidden entirely when `recent` is empty (no
sightings yet). The curated grid, its tints, and the Other expansion are unchanged.

Recent emoji are shown regardless of whether they also appear in the curated grid —
the row is a fastest-tap shortcut ("log that again"), not a filter, so a recently-seen
Fox appears both in the row and in its curated tile. That predictability is the point.

- `nameFor(emoji)` added to `lib/critters.ts`: returns the curated name or `null`.
- Threading: App computes `recentEmoji(sightings, 6)` and passes it to
  `LogSightingFlow`, which forwards it to `EmojiPicker`. `LogSightingFlow`'s existing
  behavior is otherwise unchanged (recent is an additive prop with a `[]` default so
  its current tests need no edits).

## App wiring

- Render all three tab panels; the two inactive carry the `hidden` attribute, which
  excludes them from the accessibility tree — so `getByRole` queries (and thus the
  App tests) see only the active tab's content, and no cross-pane query ambiguity
  arises. Calendar → `CalendarPane`; history → `HistoryPane`; leaderboard →
  `TopCrittersPane`. Keeping all three mounted preserves each pane's local state
  (e.g. the calendar's visible month, the history filter) across tab switches. Each
  panel's `RecentCritters`/sidebar placement is unchanged from today except the
  sidebar now also mounts `LeaderboardList` (top 10) below Recent Critters on desktop.
- `LogSightingFlow` gets `recent={recentEmoji(sightings, 6)}`.

## Error handling

All views derive from local state; no new fetch paths, no new error surfaces. The
existing load-error banner already covers a failed initial fetch for every tab.

## Testing

- **insights.ts unit matrix:** `filterByRange` (both bounds, open-ended each side,
  single-day range, excludes-all, empty input, order preserved); `leaderboard`
  (counts, count-desc order, tie-break by recency then codepoint, empty); `recentEmoji`
  (distinctness, createdAt-desc order incl. a back-dated sighting logged most recently,
  limit, empty).
- **HistoryPane:** filter shows/hides Clear; From/To narrow the list inclusively;
  Clear resets; row tap calls onSelect; both empty states.
- **LeaderboardList:** ordering, medals for 1–3 then #N, bar width floor at 8%,
  rows inert (no button role).
- **EmojiPicker:** recent row hidden when empty; shown with recent emoji; tapping a
  recent curated emoji pre-fills the name, a recent non-curated one leaves it blank;
  curated grid still present and unchanged.
- **App:** switching to History/Top Critters renders real panes; desktop sidebar shows
  the top-10 leaderboard; recent row appears in the picker after sightings load.
- **Polish batch:** the five items each get/keep their test (calendar bleed-day,
  empty-date guard, SightingDetail 401, ARIA panels present, tsconfig still builds).
- Existing suite stays green (LogSightingFlow, calendar, etc. unedited where possible).

## Out of scope (next cycle)

Photo upload (the log-flow photo control + server storage + the Sighting Detail photo
block) · edit flows · leaderboard drill-in · per-critter history.

## Definition of done

- Log varied sightings across dates → History lists them most-recent-first and filters
  correctly by From/To (inclusive, open-ended, Clear) → Top Critters ranks them with
  medals and proportional rainbow bars → the desktop sidebar shows the top 10 → the
  picker's "Recently seen" row surfaces the just-logged critters and one tap re-logs one.
- Both breakpoints match handoff §3/§4; leaderboard bars/medals correct; sidebar
  renders only on desktop and only when non-empty.
- Polish batch landed with tests. Full suite, lint, typecheck, build green; CI green.
