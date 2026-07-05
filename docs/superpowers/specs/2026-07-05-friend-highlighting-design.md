# Friend Highlighting — Design Spec

**Date:** 2026-07-05
**Status:** Approved
**Depends on:** quick followups (PR #12), critter profiles (PR #9). First feature
beyond the original design handoff.

## Purpose

Natalie's friends should stand out: a ⭐ marks friend sightings wherever sighting
rows render, and a Friends filter in History shows just her regulars — "how is
Mr Fox doing?"

## Decisions (alternatives considered)

| Decision | Choice | Alternatives rejected |
|---|---|---|
| Star scope | Every SightingRow render site: Recent Critters (mobile + desktop sidebar), History, Day Detail | Recent+History only (same sighting starred in one view, bare in another); History-only |
| Filter UI | "⭐ Friends" toggle chip beside the From/To date row; composes with the range | Segmented All/Friends control (more chrome); per-friend dropdown (bigger feature — natural later step, out of scope) |
| Matching | Shared predicate: profile matches sighting by emoji + `normalizedName` (the SightingDetail rule); key-Set built once per profiles change | Per-row `profiles.find` scans (O(rows×profiles)); id-based linkage (no FK exists by design) |
| Clear semantics | Clear resets From, To, AND the chip; renders when any is set | Chip outside Clear (two reset gestures for one filter row) |

## What ships

### 1. `app/src/lib/friends.ts` — the shared predicate

```ts
import type { Profile, Sighting } from '../api'
import { normalizedName } from './critters'

// '\u0000' can't appear in emoji or trimmed names — safe key separator.
export function friendKeys(profiles: Profile[]): Set<string>
// emoji + '\u0000' + normalizedName(name) per profile

export function isFriendSighting(sighting: Sighting, keys: Set<string>): boolean
// false when sighting.name === null; otherwise keys.has(emoji + '\u0000' + normalizedName(name))
```

App memoizes `const keys = useMemo(() => friendKeys(profiles), [profiles])` and
threads `keys` to the row-rendering panes. SightingDetail's own `matching` lookup
is unchanged (it needs the profile's id for removal, not just a boolean).

### 2. Stars on SightingRow

`SightingRow` gains `starred?: boolean` (default false — absent call sites render
byte-identically). When true:
- a `<span className="row-star" aria-hidden="true">⭐</span>` renders immediately
  after the name text;
- the row's accessible name gains ", friend" (append to the existing aria-label
  or visually-hidden text — match however SightingRow labels rows today).

All call sites (RecentCritters, HistoryPane, Day Detail's list) pass
`starred={isFriendSighting(s, keys)}`. CSS: `.row-star { font-size: 11px; margin-left: 4px; }`.

### 3. History "⭐ Friends" chip

In `HistoryPane` (which gains a `friendKeys: Set<string>` prop), a toggle chip
renders at the end of the filter row:
- `<button type="button" className={friendsOnly ? 'friends-chip active' : 'friends-chip'} aria-pressed={friendsOnly}>⭐ Friends</button>`
- Local `friendsOnly` state, default false.
- List = `filterByRange(sightings, from, to)` then, when `friendsOnly`,
  `.filter((s) => isFriendSighting(s, keys))` — `filterByRange` stays pure/untouched.
- "Clear" renders when `from || to || friendsOnly` and resets all three.
- Chip styling: pill, hairline border at rest; active = `--tint-yellow` background
  with `--ink` text (existing tokens only, no new hexes).

**Empty states:** the two existing messages are unchanged; when `friendsOnly` is
on and the (range-)filtered list has no friend sightings →
**"No friend sightings here 😿"**.

## Error handling

None new — all derivation from loaded state. Profiles load failure ⇒ empty key
set ⇒ no stars, chip filters to the friends-empty state (consistent with the
picker's silent degradation).

## Testing

- **lib/friends unit matrix:** case/whitespace name variants match; emoji mismatch
  doesn't; nameless sightings never; empty profiles ⇒ empty set; separator safety
  (a name containing the other's emoji can't collide).
- **SightingRow:** starred renders ⭐ + ", friend" accessible text; default/false
  renders byte-identical DOM to today (no test edits needed for old call sites).
- **HistoryPane:** chip toggles aria-pressed; friends filter composes with the
  date range (friend inside range shown; friend outside hidden; non-friend inside
  hidden); Clear appears for chip-only and resets all three; friends-empty copy
  exact.
- **App threading:** after load with a matching profile, the Recent Critters row
  shows ⭐; History chip end-to-end (toggle → only friend rows).
- Frozen: LogSightingFlow.test.tsx, DetailsForm.test.tsx byte-unchanged (this
  feature doesn't touch the log flow).

## Out of scope

Per-friend filtering (dropdown/faces row) · stars in the calendar grid or
leaderboard · friend stats.

## Definition of done

- Log Mr Fox (matching his profile, any casing) → his rows show ⭐ in Recent
  Critters, History, and Day Detail; an unnamed fox sighting shows no star.
- History: ⭐ Friends chip shows only friend sightings, composes with From/To,
  Clear resets everything; empty copy exact.
- Full suite, lint, typecheck, build green; CI green on the PR.
