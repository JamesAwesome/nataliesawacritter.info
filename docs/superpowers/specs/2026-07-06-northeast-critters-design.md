# Northeast Critter Curation — Design Spec

**Date:** 2026-07-06
**Status:** Approved
**Depends on:** current main (through entry auth gate #15 and dep bumps).

## Purpose

Natalie hunts too much in the "Other" grid because the 12 curated fast-tiles
don't match what she actually sees. Recurate the fast path to 18 animals native
to the American Northeast — backyard regulars plus a few woodland stars — so the
critter she saw is almost always one tap away, no "Other" needed.

## Decisions (alternatives considered)

| Decision | Choice | Alternatives rejected |
|---|---|---|
| Content source | Common NE wildlife with a faithful emoji | Data-driven from her logged sightings (not enough history yet); keep-and-swap only (too timid — misses second-tier regulars) |
| Flavor | Backyard regulars + a few woodland stars | All-everyday (loses the exciting rare sightings); hand-pick each (done implicitly via approval) |
| Count | 18 (up from 12) | 12 (too few — bench animals kept getting cut); 16/20 (would fill the 4-col grid evenly, but 18 was the explicit ask and lays out fine) |
| Scope | Curated tiles only | Also reorder the "Other" extended grid (bigger diff; the 18 make it rarely needed) |
| Butterfly / Moose | Excluded | Butterfly opens the bug category (bees, dragonflies); 🫎 Moose emoji renders as tofu on older phones |

## The curated 18

Replaces `CURATED` in `app/src/lib/critters.ts`, in this exact order:

```ts
export const CURATED: Critter[] = [
  { emoji: '🦌', name: 'Deer', tint: 'var(--tint-pink)' },
  { emoji: '🐿️', name: 'Squirrel', tint: 'var(--tint-peach)' },
  { emoji: '🐇', name: 'Rabbit', tint: 'var(--tint-yellow)' },
  { emoji: '🐦', name: 'Bird', tint: 'var(--tint-mint)' },
  { emoji: '🦝', name: 'Raccoon', tint: 'var(--tint-aqua)' },
  { emoji: '🦨', name: 'Skunk', tint: 'var(--tint-sky)' },
  { emoji: '🦉', name: 'Owl', tint: 'var(--tint-lavender)' },
  { emoji: '🦆', name: 'Duck', tint: 'var(--tint-orchid)' },
  { emoji: '🐸', name: 'Frog', tint: 'var(--tint-pink)' },
  { emoji: '🐢', name: 'Turtle', tint: 'var(--tint-peach)' },
  { emoji: '🦇', name: 'Bat', tint: 'var(--tint-yellow)' },
  { emoji: '🐭', name: 'Mouse', tint: 'var(--tint-mint)' },
  { emoji: '🐍', name: 'Snake', tint: 'var(--tint-aqua)' },
  { emoji: '🦊', name: 'Fox', tint: 'var(--tint-sky)' },
  { emoji: '🦃', name: 'Turkey', tint: 'var(--tint-lavender)' },
  { emoji: '🐻', name: 'Bear', tint: 'var(--tint-orchid)' },
  { emoji: '🦅', name: 'Eagle', tint: 'var(--tint-pink)' },
  { emoji: '🦫', name: 'Beaver', tint: 'var(--tint-peach)' },
]
```

Tints cycle the existing 8 pastel tokens in order (pink→orchid), repeating — they
are decorative and not bound to a species. No new tint tokens.

Notes carried from brainstorming (not code, just rationale):
- 🐿️ renders as a chipmunk glyph on most platforms; named "Squirrel" to match
  user expectation (covers both squirrel and chipmunk).
- 🐦 is the generic songbird tile — cardinal, blue jay, robin, chickadee have no
  dedicated emoji.

## EXTENDED must stay disjoint from CURATED

Today `CURATED` and `EXTENDED` share no emoji — an animal is either a fast tile
or an "Other" tile, never both. This recuration must preserve that, or promoted
animals would render twice (once in each grid). Verified against the current
file:

- **Remove from `EXTENDED`** the 8 animals promoted into the new curated set,
  all of which currently live in `EXTENDED`: 🦨 🦇 🐭 🐍 🦃 🐻 🦅 🦫.
  (When removing 🐭, leave 🐁 🐀 🐹 — only the exact `🐭` glyph is promoted.)
- **Add to `EXTENDED`** the 2 animals demoted out of the curated set, neither of
  which is currently in `EXTENDED`, so they stay reachable under "Other":
  🦔 Hedgehog and 🦋 Butterfly. Append them in a sensible category slot
  (🦔 near the small mammals, 🦋 near the insects at the end).
- 🐢 Turtle stays curated and is not in `EXTENDED` — no change for it.

A test asserting `CURATED` and `EXTENDED` share no emoji guards this invariant
going forward.

## Other scope boundaries

- `nameFor()` is unchanged in behavior — it derives names from `CURATED`, so the
  new tiles' names ("Skunk", "Bat", etc.) become the recently-seen labels and
  pre-filled critter names automatically.
- No layout/CSS change: the 4-column `.picker-grid` handles 18 tiles + "Other"
  as four rows of four plus a short final row.

## Testing

- **`critters.test.ts`** (or wherever `CURATED`/`nameFor` are unit-tested):
  assert the set has 18 entries, that a spot-check of new names resolves via
  `nameFor` (e.g. `nameFor('🦨') === 'Skunk'`, `nameFor('🐻') === 'Bear'`), that
  a removed emoji returns null (`nameFor('🦔') === null`), and that `CURATED` and
  `EXTENDED` share no emoji (the disjoint invariant above).
- **`EmojiPicker` / `LogSightingFlow` tests**: existing assertions that
  reference surviving tiles (deer, duck, fox, "Other") keep passing; any
  assertion referencing a removed tile (hedgehog, butterfly, or an exact
  12-count) is updated to the new set — replace the reference, don't drop the
  coverage.
- Full suite, lint, typecheck green; CI green.

## Out of scope

Reordering the "Other" grid · adding bug/insect tiles · Moose (emoji rendering
risk) · data-driven curation from sighting history · any grid/CSS change.

## Definition of done

- The log-sighting picker shows the 18 NE animals above, in order, before
  "Other".
- Tapping a new tile (e.g. Skunk) advances to details with the name pre-filled;
  it shows in "Recently seen" with its name.
- Hedgehog and Butterfly are still reachable under "Other".
- Full suite, lint, typecheck, build green; CI green on the PR.
