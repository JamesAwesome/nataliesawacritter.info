# Calendar Cycle — Design Spec

**Date:** 2026-07-03
**Status:** Approved
**Depends on:** shell + log flow (PR #6, merged), sightings API (PR #4)
**Design source:** docs/design/README.md §2 (Calendar), §6 (Day Detail), §7 (Sighting Detail), Design Tokens

## Purpose

The calendar becomes real: the default tab renders Natalie's sightings on a month
grid, day cells open a Day Detail sheet, and sightings open a Sighting Detail sheet
with delete. Recent Critters rows become tappable. This is the biggest visual payoff
cycle, landing on real logged data.

Remaining after this cycle: history + top critters → photo upload.

## Decisions (alternatives considered)

| Decision | Choice | Alternatives rejected |
|---|---|---|
| Delete UX | Two-tap lightweight confirm: Delete → red "Really delete?" for ~4s → second tap deletes. Handoff explicitly invites deviating from the prototype's immediate delete | Immediate (fat-finger data loss); undo toast (re-create plumbing, most work) |
| Auth for delete | Extract `useWriteAction` hook from LogSightingFlow's 401/prompt machinery — the agreed "second consumer" trigger has arrived | Copy-paste into SightingDetail (flagged dup cost); auth context/provider (over-engineered for two callers) |
| Photo block in Sighting Detail | Omitted — `photoPath` is always null until the photo cycle | Rendering the handoff's striped placeholder for a field that can't be set |
| Month math | Pure `lib/calendar.ts`, unit-tested; components stay thin | Date logic inline in components (untestable without render) |
| 404 on delete | Treat as already-gone: remove from local state, close normally | Error state for a row that no longer exists server-side |

## What ships

### Cycle opener: hygiene commit (queued from prior reviews)

- Shared client test helpers in `app/src/test/`: `makeSighting(overrides)` fixture
  builder (replaces the ROW literals ×3 and RecentCritters' `row()`), a queue-based
  fetch stub (replaces `stubFetchOnce`/`stubFetchQueue`), a `stubMatchMedia` helper
  (replaces the App.test.tsx inline copy), shared fake-timer setup.
- `@media (prefers-reduced-motion: reduce)` guard disabling the sheet animations.
- Sheet scrim dismissal keyed on `pointerdown` origin (text-selection drag from a
  field to the scrim must not close the sheet).
- Tabs ARIA completed (aria-controls + tabpanel ids) or downgraded to plain buttons —
  implementer picks the smaller diff that satisfies the testing-library roles.
- Drop the redundant `mobile-only` wrapper around the JS-gated mobile RecentCritters.

### Calendar tab (handoff §2 — replaces PlaceholderPane for the calendar slot)

- White rounded-18px card, `--shadow-card`, with a 5px decorative strip at top:
  `linear-gradient(90deg,#FFD6E8,#FFE9C7,#E8FFDB,#D3F0FF,#E6DBFF)` (new token
  `--calendar-strip`).
- Month header row: circular 30px prev/next chevron buttons (border `#E3ECFA`, bg
  `#F0F7FF`) flanking "Month YYYY" (Fredoka 600 16px). Unbounded navigation.
- Weekday header: S M T W T F S, 11px 700 `--ink-tertiary`.
- 7×6 day grid. Cell: `aspect-ratio: 1`, rounded-12px, 1px border. Rules:
  - in-month, no sightings: border `--border-hairline`, bg white, NOT clickable
  - in-month with sightings: bg `#F0F7FF` (`--surface-input`), clickable → Day Detail
  - today: border color `--tab-calendar` (on top of either bg)
  - out-of-month: bg `#F5F8FC` (new token `--out-of-month`), 35% opacity, not clickable
  - content: day number (10px 700 `--ink-secondary`) + up to 2 emoji + "+N" suffix
    when more than 2 (e.g. "🦌🐦 +1")
- Visible month defaults to the current month; state lives in the Calendar pane
  (`{year, month}`), not App.
- Mobile Recent Critters stays under the calendar card (existing placement).

### lib/calendar.ts (pure)

```ts
export type CalendarCell = {
  date: string            // YYYY-MM-DD
  dayOfMonth: number
  inMonth: boolean
  isToday: boolean        // computed against a passed `today` string (testability)
  sightings: Sighting[]   // that day's sightings, most recent first
}
export function monthGrid(
  year: number, month: number,          // month 1-12
  sightings: Sighting[], today: string,
): CalendarCell[]                        // exactly 42 cells, weeks start Sunday
export function monthLabel(year: number, month: number): string  // "July 2026"
export function addMonths(year: number, month: number, delta: 1 | -1): { year: number; month: number }
```

Grouping by `sightedOn` string equality; within a day, `createdAt` desc (matches the
list ordering the API already returns — derive from array order, don't re-sort).

### Day Detail sheet (handoff §6)

Reuses `Sheet`. Content: date heading "Mon D" (Fredoka 600), a list of that day's
sightings (same row anatomy as Recent Critters: emoji, name-or-emoji, time-or-"just
now" — reuse the row rendering), each row tappable → Sighting Detail with
`fromDay` set. "Close" button.

### Sighting Detail sheet (handoff §7)

- Centered header: emoji 44px, name (Fredoka 600 18px; emoji fallback when null),
  "Mon D · time" meta (13px `--ink-secondary`).
- Conditional: 📍 place line (bold) when present; comment block (13px, tinted panel)
  when present. No photo block this cycle.
- Footer: "Back" — returns to Day Detail when `fromDay` is set, otherwise closes.
  "Delete" — two-tap confirm: first tap swaps the button to "Really delete?"
  (bg `--danger-bg`, text `--danger-text`), auto-reverts after ~4s; second tap runs
  the delete. On success: sheet closes (no toast — the row visibly disappearing is
  the feedback). 404 → treat as already deleted (remove locally, close). 401 →
  password prompt via `useWriteAction`. 503/network → inline error in the sheet,
  sighting untouched.
- Entry points: Day Detail rows, Recent Critters rows (now tappable — `onSelect(id)`
  prop; chevron already renders).

### Sheet routing (App)

```ts
type SheetState =
  | null
  | { kind: 'log' }
  | { kind: 'day'; date: string }
  | { kind: 'sighting'; id: string; fromDay?: string }
```

One sheet mounted at a time. Sighting Detail's Back with `fromDay` → `{kind:'day',
date: fromDay}`. Day Detail rows → `{kind:'sighting', id, fromDay: date}`. If the
sighting id disappears from state while open (deleted elsewhere), the sheet closes.

### Data & auth

- `api.ts`: `deleteSighting(id: string, authHeader: string): Promise<void>` —
  DELETE `/api/sightings/:id`; 204 resolves; non-2xx throws `ApiError(status)`.
- `useSightings`: `removeSighting(id, authHeader)` — calls `deleteSighting` and
  removes the row from state on success. A 404 is treated as success (the row is
  gone server-side either way: remove locally, resolve). All other errors rethrow
  with no state change.
- `useWriteAction` (new, `app/src/hooks/useWriteAction.ts`): extracted from
  LogSightingFlow. Owns: credential lookup, password-prompt open/error state,
  storing the password before the attempt, 401 → clear + re-prompt ("Wrong password —
  try again"), 503 → "Saving is disabled right now" (message overridable), other →
  generic message, in-flight re-entrancy guard, abandonment guard (session token).
  Exposes `{ run(action: (header: string) => Promise<void>), prompt: {open, error,
  onSubmit, onCancel}, busy, actionError, clearActionError }`. LogSightingFlow is
  refactored onto it with ZERO behavior change — its existing tests must pass
  unmodified (except imports if unavoidable). SightingDetail consumes the same hook.

## Error handling

- Calendar/day/sighting views render from local state — no new fetch paths.
- Delete paths per Sighting Detail above. No error discards local data.

## Testing

- `lib/calendar.ts` unit matrix: 42-cell shape; leading/trailing days around
  month boundaries; leap February (2028-02); week straddling a year boundary
  (Dec 2026→Jan 2027); today flag; grouping and "+N" data (3+ sightings/day);
  `addMonths` wrap (Jan−1, Dec+1).
- Calendar pane: renders current month; prev/next updates label and grid; cell with
  sightings clickable, without not; today ring class; out-of-month dimmed.
- Navigation chains: calendar cell → Day Detail → row → Sighting Detail → Back →
  Day Detail → Close; Recent Critters row → Sighting Detail → Back closes (no
  fromDay).
- Delete: two-tap confirm (single tap does NOT delete; confirm state auto-reverts on
  timer); success removes the row from calendar + recent and closes; 404 treated as
  success; 401 → prompt → correct password deletes; 503 → inline error, row remains.
- Refactor guard: all existing LogSightingFlow tests pass unchanged on top of
  `useWriteAction`.

## Out of scope (later cycles)

History tab · Top Critters tab + desktop sidebar top-10 · photo upload (and the
photo block in Sighting Detail) · edit flows · undo.

## Definition of done

- Log a sighting today → it appears on today's calendar cell; tap the cell → Day
  Detail; tap the row → Sighting Detail; delete with the two-tap confirm → it
  disappears from calendar and Recent Critters.
- Month navigation works across year boundaries; the grid matches the handoff's
  cell rules visually at both breakpoints.
- Full suite green (incl. unchanged LogSightingFlow tests); lint/typecheck/build
  green; CI green on the PR.
