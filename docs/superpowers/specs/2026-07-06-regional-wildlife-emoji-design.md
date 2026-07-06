# Regional Wildlife Emoji — Design

**Date:** 2026-07-06
**Status:** Approved (pending spec review)

## Purpose

Natalie lives in Pennsylvania and vacations in Maine. Give her emoji for the
notable regional wildlife she actually sees. Most common animals already have
Unicode emoji (already in the picker); this spec covers the gap — iconic species
Unicode lacks — as hand-drawn custom emoji, plus one easy Unicode addition
(moose).

This extends the existing custom-emoji system (see
`2026-07-06-custom-emoji-design.md`): a `custom:<slug>` token in the
`sightings.emoji` text column, a static SVG in `app/public/custom-emoji/`, a
client + server catalogue, and a Unicode stand-in for text-only surfaces.

## The set

### Custom emoji (no Unicode exists → hand-drawn SVG)

All nine are **candidates**; the art-approval gate (below) decides which ship.

| slug | Name | Region | Category | Stand-in | Risk |
| --- | --- | --- | --- | --- | --- |
| `groundhog` | Groundhog | PA | mammals | 🦫 | — (requested) |
| `porcupine` | Porcupine | PA | mammals | 🦔 | — |
| `opossum` | Opossum | PA | mammals | 🐀 | — |
| `bobcat` | Bobcat | PA | mammals | 🐱 | reads as a housecat |
| `loon` | Common Loon | Maine | birds | 🦆 | — |
| `puffin` | Atlantic Puffin | Maine | birds | 🐧 | — |
| `grouse` | Ruffed Grouse | PA | birds | 🐔 | — (PA state bird) |
| `firefly` | Firefly | PA | bugs | 🪲 | — (PA state insect) |
| `hellbender` | Eastern Hellbender | PA | reptiles | 🦎 | obscure (PA state amphibian) |

The stand-in is the Unicode fallback shown on RSS titles and push
notifications. `category` is one of the five picker-category keys (`birds`,
`mammals`, `reptiles`, `sea`, `bugs`).

### Unicode addition (already exists → just add to the picker)

- **Moose 🫎** (Maine state animal) — added to `EXTENDED` and the Mammals
  category. No art. (Unicode 15; renders on modern devices, degrades to tofu on
  very old ones — acceptable.)

Already covered, no action: deer 🦌, black bear 🐻, beaver 🦫, wild turkey 🦃,
bald eagle 🦅, chipmunk 🐿️, lobster 🦞, harbor seal 🦭, honeybee 🐝, and
Maine's state bird the black-capped chickadee (already a custom emoji).

## Mechanism changes

### Custom emoji gain a `category`

Today the custom catalogue implicitly assumes every custom emoji is a bird —
`emojiCategories.ts` prepends *all* `CUSTOM` tokens to the Birds group. These new
animals span mammals, bugs, and amphibians, so:

- `CustomEmoji` gains a `category` field:
  `{ slug, name, standIn, category }`, where `category` is a picker-category key.
  The seven existing birds get `category: 'birds'`.
- `emojiCategories.ts` places each custom token into its declared category: each
  category's items become `[…custom tokens whose category === key, …that
  category's Unicode emoji]` (custom first). A small helper
  `customTokensFor(key)` reads `CUSTOM`.

This keeps the catalogue the single source of truth per animal and the picker
data-driven.

### Server + Unicode

- `server/customEmoji.ts`: add each shipped slug → stand-in to `STAND_INS`
  (`KNOWN_SLUGS` derives from it). Server needs no `category` (it only does
  stand-ins + validation).
- `critters.ts`: add `🫎` to `EXTENDED`; `emojiCategories.ts` Mammals Unicode
  list gains `🫎` (the coverage test forces this to stay in sync).

## The art-approval gate

Custom SVGs are the risk. Process:

1. Draw all nine candidate SVGs in the shared flat style (viewBox `0 0 64 64`,
   transparent background), each recolored/shaped for recognizability.
2. Render them in a labeled contact sheet — light and dark, at 24px and larger —
   for review.
3. **Natalie/James approve the keepers.** Animals whose art isn't good enough are
   **cut** and documented; the shipped slug set is finalized from the approved
   list.
4. Only approved animals get catalogue entries (client + server), a category
   placement, and pinned-list/test coverage.

So the exact final `CUSTOM` additions depend on the gate outcome — the
implementation draws first, gates, then wires up only the winners.

## Testing

Extends the existing drift guards to the final approved set:

- **client `customEmoji`**: pinned slug list = existing birds + approved new
  animals; every slug has an on-disk SVG; every custom entry has a valid
  `category` (one of the five keys).
- **server `customEmoji`**: `KNOWN_SLUGS` matches the same slug list; stand-ins
  resolve.
- **`emojiCategories`**: still covers `CURATED ∪ EXTENDED` exactly once (now
  including 🫎); every custom token appears in exactly its declared category; no
  duplicates.
- Visual: the approved SVGs verified at real size in the picker categories
  (light + dark) — Definition-of-Done item, since jsdom can't measure art.

## Out of scope

Upload / user-created emoji · a management UI · a DB table · custom stand-in
selection UI · animals that already have a Unicode emoji (they're added directly,
not drawn) · non-PA/Maine wildlife.

## Definition of done

- Approved regional animals ship as custom emoji: pickable from the correct
  "Other" category, logged as `custom:<slug>`, named, tracked in Top Critters
  with their picture, and shown with the stand-in on RSS/push.
- Moose 🫎 is pickable from Mammals.
- Cut candidates (if any) are documented in the PR.
- Drift + coverage tests green; the approved SVGs pass visual review; full suite,
  lint, typecheck, build green; CI green.
