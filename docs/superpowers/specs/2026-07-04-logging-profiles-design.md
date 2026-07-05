# Logging Improvements + Critter Profiles — Design Spec

**Date:** 2026-07-04
**Status:** Approved
**Depends on:** all prior cycles (skeleton, sightings API, shell + log flow, calendar, history + top critters — PRs #4–#8, merged)
**Next after this:** photo upload (last remaining handoff feature)

## Purpose

Three logging-quality improvements before the photo cycle:
1. A real time-input experience (native picker + "Now") replacing the bare free-text field.
2. A guard against logging sightings on future dates (currently possible).
3. Saved critter profiles — "friends" like **Mr Fox** at the train station — so Natalie
   logs her regulars in two taps.

## Decisions (alternatives considered)

| Decision | Choice | Alternatives rejected |
|---|---|---|
| Time input | Native `<input type="time">` + "Now" button; value converted to a friendly string ("2:30 PM") stored in the existing free-text `sightedTime` column | Quick-pick chips (unspecified design surface); strict HH:MM storage (breaks display consistency with old free-text rows) |
| Future-date guard | Client `max` + Save-disable AND server rejection beyond UTC today + 1 day (timezone grace) | Client-only (API stays permissive); server exact-today (false rejects near midnight local time) |
| Profile shape/creation | `{emoji, name, place?}`; created/removed from Sighting Detail via a toggle button | Extra save-checkbox in the log form (redundant); a manage screen (YAGNI) |
| Friend tap behavior | Prefill Step B (emoji+name+place, date today) → one Save tap | Instant log (mis-tap creates data); ask-each-time menu (friction) |
| Profile storage | Server table + API, mirroring sightings (cross-device, durable, same test rigor) | localStorage (per-device, fragile) |
| Duplicate friends | DB unique index on (emoji, name); POST conflict → 409; client treats 409 as already-saved | Client-only dedup (races); no constraint (silent duplicates) |

## What ships

### 1. Time input (client only)

- `DetailsForm`: the Time field becomes `<input type="time">` with a "Now" button
  beside it (fills the input with the current local HH:MM). Still optional — blank
  saves `sightedTime` omitted and displays "just now" as today.
- On save, a non-empty time value converts via `formatClockTime` to a 12-hour
  friendly string — exactly what gets stored in the free-text `sightedTime` column
  and displayed by the untouched `formatWhen`. Old rows ("dusk") remain valid.
- New pure helpers in `app/src/lib/format.ts`:

```ts
export function formatClockTime(hhmm: string): string  // '14:30' → '2:30 PM', '00:05' → '12:05 AM', '12:00' → '12:00 PM'
export function nowClockTime(): string                 // current local time as 'HH:MM' (for the input value)
```

`formatClockTime` returns non-`HH:MM` input unchanged (defensive passthrough — the
native input only emits `HH:MM` or `''`, but the helper must never mangle a string).

### 2. Future-date guard

- **Client** (`DetailsForm`): the date input gets `max={today()}` (existing local
  `today()` helper), and Save is disabled when `sightedOn > today()` (string
  compare; catches typed dates that bypass the picker `max`). Disabled reason is
  visual only (no new copy).
- **Server** (`app/server/sightings/routes.ts`): POST validation adds — after the
  existing format check — a range check: `sightedOn` later than **UTC today + 1
  day** → field error `sightedOn: 'must not be in the future'` in the standard 400
  validation envelope. The +1-day grace absorbs client-ahead-of-UTC timezones.
  History GET from/to filters stay unconstrained.

### 3. Critter profiles ("friends")

**Schema** — new migration (drizzle) adding `critter_profiles`:
`id` uuid PK default gen_random_uuid() · `emoji` text NOT NULL · `name` text NOT
NULL · `place` text NULL · `created_at` timestamptz NOT NULL default now(), plus a
**UNIQUE index on (emoji, name)**.

**API** (mirrors sightings' patterns, same length caps, same write gate):
- `GET /api/profiles` — public; all profiles, `created_at` DESC.
- `POST /api/profiles` — auth. Body: `emoji` (required, ≤16), `name` (required,
  ≤100 — required is the point of a profile), `place` (optional, ≤100, ''→null).
  Unknown fields rejected. 201 row; unique-violation mapped to **409
  `{"error":"conflict"}`**; 400/401/503 as elsewhere.
- `DELETE /api/profiles/:id` — auth; 204 / 404 / 400-non-uuid, same as sightings.

**Server structure** — `app/server/profiles/{store,routes}.ts` mirroring
`sightings/`; `createApp` deps gain `profilesStore`; router mounted at
`/api/profiles` behind the same writeGate selection. The store's `create` catches
the Postgres unique-violation (code `23505`) and signals conflict distinctly.

**Client data** — `api.ts`: `Profile` type, `listProfiles()`,
`createProfile(fields, header)`, `deleteProfile(id, header)` (409 → `ApiError(409)`).
New `useProfiles` hook mirroring `useSightings`:
`{ profiles, status, addProfile, removeProfile, retry }` — `addProfile` prepends
the created row on 201; on **409 it resolves without error and refetches the list**
(so the local state converges on whatever row already exists server-side).

**Picker "Friends" row** — `EmojiPicker` gains `friends: Profile[]`. When
non-empty, a "Friends" row renders at the very top (above "Recently seen"):
each tile shows the emoji with the name beneath (small label), aria-label
`"Friend <name>"`. Tap → the flow jumps to Step B prefilled with the profile's
emoji, name, AND place (date today, time blank) → one "Save sighting" tap.
Plumbing: `DetailsForm` gains `initialPlace: string | null`; the flow's `Picked`
state gains `place`; `LogSightingFlow` gains `friends?: Profile[]` (default `[]`,
existing tests unaffected); App threads `useProfiles().profiles`.

**Save/remove as friend** — In `SightingDetail`, between the content and the
footer: when the sighting has a name and NO matching profile exists (match =
same emoji + name), show "⭐ Save as friend" → `addProfile({emoji, name, place})`
via `useWriteAction` (its third consumer; messages "Saving is disabled right now" /
"Couldn't save — try again"). When a matching profile exists, show "Remove friend"
→ `removeProfile(id)`. Nameless sightings show neither (a friend needs a name).
The button reflects state immediately after the action completes.

## Error handling

- Profiles load failure: the Friends row simply doesn't render (no new error
  surface — the picker stays usable); `useProfiles.retry` exists for future use.
- Profile writes: standard useWriteAction mapping (401 prompt / 503 / generic);
  409 on add = treated as already-saved (button flips to "Remove friend").
- Future-date 400 from the server surfaces via the existing generic save error
  (the client guard makes it unreachable from the UI).

## Testing

- **format**: `formatClockTime` matrix (midnight, noon, single-digit minutes,
  invalid input passthrough decision: non-`HH:MM` input returned unchanged);
  `nowClockTime` under fake clock.
- **DetailsForm**: Now button fills the time input; saved payload carries the
  friendly string; blank time omitted; future date disables Save; `max` attr set.
- **Server**: future-date rejection (boundary: UTC today+1 accepted, +2 rejected);
  profiles validation matrix (name required); store CRUD + unique-conflict via
  Testcontainers; routes unit tests with fake store incl. 409 mapping; seam test.
- **Client profiles**: useProfiles load/add/remove/409-idempotent; picker Friends
  row (hidden when empty, tap → prefilled Step B incl. place); SightingDetail
  save/remove-friend toggle incl. 401 prompt path and nameless-sighting hiding.
- All existing suites green; LogSightingFlow tests unchanged (friends prop optional).

## Out of scope

Photo upload · profile editing (delete + re-save covers it) · profile-based
stats/filtering · time-zone storage (times remain display strings).

## Definition of done

- Log with the time picker + Now → History/Recent show "2:30 PM"-style text.
- A future date can't be saved from the UI; curl with sightedOn beyond UTC+1 day
  gets a 400 field error.
- Save "Mr Fox" (🦊, train station) as a friend from Sighting Detail → Friends row
  appears in the picker → tap → Step B prefilled incl. place → Save = logged.
  Remove friend works; re-saving an existing friend is a no-op (409 path).
- Full suite, lint, typecheck, build green; CI green on the PR.

## Post-implementation amendments (2026-07-04, user feedback on the PR)

- **Log-form friend toggle**: Step B gains a "⭐ Save as a friend" checkbox
  (disabled until a name is entered). On Save the sighting logs first, then the
  friend saves best-effort in the same authenticated action — failures never
  block logging or the toast; Sighting Detail's toggle is the recovery path;
  already-a-friend resolves silently via the 409 path. This supersedes the
  original decision to create friends only from Sighting Detail (both paths
  now exist; the two-step-only flow felt disjointed in practice).
- **Recently seen limit**: 4 (was 6).
- **Friend identity hardening** (antagonistic review): names trimmed at the form
  and route; the Sighting Detail match is case/whitespace-insensitive. A DB-level
  unique index on (emoji, lower(trim(name))) is deferred to the photo cycle.
