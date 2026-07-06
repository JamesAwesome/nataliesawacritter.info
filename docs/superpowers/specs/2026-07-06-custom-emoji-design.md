# Custom Emoji (Shipped Image + Stand-In) — Design Spec

**Date:** 2026-07-06
**Status:** Approved
**Depends on:** current main (through leaderboard-by-name #22).

## Purpose

Unicode has no robin (or cardinal, blue jay, chickadee…). Ship a small set of
**custom emoji** — flat SVG bird pictures rendered throughout the app — each with
a **Unicode stand-in** used on text-only surfaces (RSS titles, push
notifications). Natalie picks "Robin" like any critter; it logs, displays as a
robin picture, and tracks separately in Top Critters.

## Decisions (from brainstorming)

| Decision | Choice | Rejected |
|---|---|---|
| What a custom emoji is | A shipped flat-SVG image + a Unicode stand-in | Named-entry-only (no picture); user uploads (no upload UI) |
| Storage | Static code catalogue + a `custom:<slug>` token in the existing `emoji` text column | New `custom_emoji` table + FK (migration/index overkill for a fixed shipped set) |
| Images | Hand-authored flat pastel SVGs, shipped as static files | Procedural PNGs (blobby); user-supplied |
| Starter set | Robin, Cardinal, Blue Jay, Chickadee, Goldfinch, Sparrow (all `🐦` stand-in) | — |

## Data model

- **Token:** a custom sighting stores `` `custom:${slug}` `` in `sightings.emoji`
  (still a plain `text` column — no schema change, no migration). A normal
  sighting still stores a Unicode string. The two are told apart by the
  `custom:` prefix.
- **Client catalogue** — new `app/src/lib/customEmoji.ts`:

  ```ts
  export type CustomEmoji = { slug: string; name: string; standIn: string }
  export const CUSTOM: CustomEmoji[] = [
    { slug: 'robin', name: 'Robin', standIn: '🐦' },
    { slug: 'cardinal', name: 'Cardinal', standIn: '🐦' },
    { slug: 'blue-jay', name: 'Blue Jay', standIn: '🐦' },
    { slug: 'chickadee', name: 'Chickadee', standIn: '🐦' },
    { slug: 'goldfinch', name: 'Goldfinch', standIn: '🐦' },
    { slug: 'sparrow', name: 'Sparrow', standIn: '🐦' },
  ]
  export const CUSTOM_PREFIX = 'custom:'
  export function tokenFor(slug: string): string          // `custom:${slug}`
  export function customFor(emoji: string): CustomEmoji | null  // known token → entry, else null
  export function standInFor(emoji: string): string       // custom → its standIn (unknown custom → '🐦'); else the emoji itself
  ```

- **Images:** `app/public/custom-emoji/<slug>.svg` — hand-authored flat pastel
  bird icons (viewBox `0 0 64 64`, distinct by color/shape: robin brown+orange
  breast, cardinal red+crest, blue jay blue+crest, chickadee gray+black cap,
  goldfinch yellow+black cap, sparrow streaky brown). Vite copies `public/` into
  `dist/client`, so they serve at `/custom-emoji/<slug>.svg` and, absolutely, at
  `${SITE_URL}/custom-emoji/<slug>.svg`.
- **Server catalogue** — new `app/server/customEmoji.ts` (the server can't import
  client `src/`): a `slug → standIn` map, `standInFor(emoji)`, and a
  `KNOWN_SLUGS` set for validation. This duplicates only the 6 stand-in pairs
  (stable, tiny) — kept honest by the sync test below.

### Catalogue-sync invariant (drift guard)

There are three sources that must agree: the client `CUSTOM` list, the server
`KNOWN_SLUGS`/stand-in map, and the on-disk `public/custom-emoji/<slug>.svg`
files. Drift is a real footgun — e.g. adding a bird to the client list only
makes the picker show it but the sightings POST **reject** it (server allowlist)
so it can't be logged; a missing SVG 404s at every render site. A unit test
asserts, for every `CUSTOM.slug`: a matching server stand-in entry AND an
existing `public/custom-emoji/<slug>.svg` file on disk. (The client test imports
the client list; a small server test covers the server side. The disk check
reads the directory.)

## Rendering

- **`CritterGlyph`** — new `app/src/components/CritterGlyph.tsx`:

  ```tsx
  export function CritterGlyph({ emoji, className }: { emoji: string; className?: string }) {
    const custom = customFor(emoji)
    if (custom !== null) {
      return <img className={className} src={`/custom-emoji/${custom.slug}.svg`} alt="" />
    }
    return <span className={className} aria-hidden="true">{emoji}</span>
  }
  ```

  The image is `alt=""` (decorative) — surrounding tiles/rows already carry
  aria-labels naming the critter. An unknown custom token (only possible if a
  slug is later removed) resolves via `customFor` to null → falls through to the
  span, showing the raw token; acceptable for a shipped set (documented, not a
  supported state).
- **Integrate `CritterGlyph`** — the render sites fall into three kinds; ALL must
  be handled or a custom token leaks as literal text:
  1. **Dedicated glyph spans** (swap `{emoji}` → `<CritterGlyph emoji={…} />`):
     `EmojiPicker` curated/extended/recent/**friends** tiles, `RecentCritters`
     (recent-emoji), `DetailsForm` (chosen-critter header), `LeaderboardList`
     (`leader-emoji`), and any `LogSightingFlow`/`DayDetail` emoji slot.
  2. **Text fallbacks** where the emoji prints as text when the name is null —
     `SightingRow` (`{sighting.name ?? sighting.emoji}`), `SightingDetail` (the
     `<h2>` and the photo `alt`). These must become
     `sighting.name ?? (nameFor(sighting.emoji) ?? sighting.emoji)` so a
     name-cleared custom sighting reads "Robin", never `custom:robin`. (`nameFor`
     resolves the custom name — see below.) The `<h2>`/row title stay text; only
     the fallback changes.
  3. **`CalendarPane` is a refactor, not a wrap.** Today it does
     `cell.sightings.slice(0, 2).map((s) => s.emoji).join('')` and prints the
     joined string — two custom sightings would render `custom:robincustom:cardinal`.
     Rewrite the join into a per-sighting `.map((s) => <CritterGlyph key=… emoji={s.emoji} />)`,
     preserving the existing `+N` overflow and `day-emoji` layout.
- **Sizing / vertical-verification:** the SVG `<img>` must visually match the
  emoji footprint at each site's font-size. A `.critter-glyph { width: 1em;
  height: 1em; object-fit: contain; vertical-align: -0.15em }` is the starting
  point, but emoji glyphs carry ~10% internal padding, so per-site tuning is
  likely. **jsdom cannot measure this** (this is exactly how the leaderboard grid
  bug shipped) — real-size visual verification is a Definition-of-Done item, not
  a green-suite assumption.
- **`nameFor`** (`app/src/lib/critters.ts`) also resolves custom names: a
  `custom:` token returns `customFor(emoji)?.name`, else the existing `CURATED`
  lookup. So picking a Robin pre-fills "Robin", and the leaderboard groups
  `(custom:robin, "Robin")` with its own image. (Import `customFor` from
  `customEmoji`; `customEmoji` imports nothing from `critters` → no cycle.)

## Picker + logging

- **`EmojiPicker`** gains a **"Birds"** section (styled like the existing
  Friends / Recently-seen rows) that lists the `CUSTOM` tiles, each rendering its
  `CritterGlyph` and label. Tapping one calls `onPick(tokenFor(slug), name)` so
  the draft's emoji becomes the token and the name pre-fills (identical to how
  curated tiles pass a name).
- The rest of the log flow is unchanged: the token flows through `DetailsForm`
  and saves as `sightings.emoji = 'custom:robin'`.

## Server

- **Validation** — a shared `emoji` validator used by BOTH the sightings and
  profiles POST routes (`sightings/routes.ts` and `profiles/routes.ts`): raise
  the length cap from `16` to `40` (tokens like `custom:chickadee` need room —
  the longest today are exactly 16, so anything longer already breaks
  save-friend), and for a `custom:` value reject it unless the slug is in the
  server's `KNOWN_SLUGS` (400), so only shipped custom emoji can be stored.
  **Both** routes must change in lockstep: "Save friend" from a custom sighting
  POSTs `emoji: sighting.emoji` to the profiles route, and friend tiles render
  `profile.emoji` (covered by the `CritterGlyph` friends-tile change above).
- **RSS** (`buildFeed.ts`): the item **title** uses `standInFor(sighting.emoji)`
  so custom tokens render as their `🐦` stand-in (the sighting's name — "Robin" —
  still carries the species). **No image is embedded in the feed** — feed readers
  strip `image/svg+xml` for security, so it would rarely render; the stand-in in
  the title is the whole story.
- **Push** (`notifier.ts` `payloadFor`): the title uses
  `standInFor(sighting.emoji)`; the notification icon stays the app paw.

## Testing

- **`customEmoji` (client + server)**: `customFor`/`tokenFor` round-trip;
  `standInFor` maps a known token to its stand-in, passes a Unicode emoji
  through unchanged, and falls back for an unknown custom token.
- **Catalogue-sync (drift guard)**: every `CUSTOM.slug` has a server stand-in
  and an existing `public/custom-emoji/<slug>.svg` file on disk.
- **`CritterGlyph`**: renders an `<img>` with the right `src`/`alt` for a token;
  renders a text span for a Unicode emoji.
- **`nameFor`**: custom name for a token, curated name for a curated emoji, null
  otherwise.
- **`CalendarPane`**: a day with two custom sightings renders **two `<img>`
  elements** (not a `custom:robincustom:…` text node), and the `+N` overflow
  still works.
- **Null-name fallback**: `SightingRow`/`SightingDetail` for a custom sighting
  with `name: null` show the resolved name ("Robin"), never the raw token.
- **`EmojiPicker`**: shows the Birds section; tapping a bird calls `onPick` with
  the `custom:<slug>` token and the name.
- **Leaderboard**: two custom birds count as separate rows.
- **Server**: both the sightings AND profiles POST accept a known `custom:`
  token and reject an unknown one and an over-length emoji; `buildFeed` title and
  `payloadFor` use the stand-in.
- Full suite, lint, typecheck, build green; CI green.

## Out of scope

Upload / user-created custom emoji · a management UI · a DB table for custom
emoji · non-bird custom emoji (the catalogue is extensible later) · custom
notification icons · editing the catalogue at runtime.

## Build order & gates

Two risks are cheapest to retire first, before any component is threaded:

1. **Art gate (do this first).** Hand-author all 6 flat SVGs and review them at
   real size (~24px) on light AND dark backgrounds — robin, sparrow, chickadee,
   and goldfinch are all small brownish birds, so distinguishability is the
   highest-risk item. If they read as six indistinguishable blobs, that surfaces
   before any integration cost is spent.
2. **Visual gate (Definition-of-Done item, not a jsdom assumption).** After
   wiring `CritterGlyph`, screenshot each render site (picker, calendar, history
   row, sighting detail, leaderboard, recent) at real size in light and dark, and
   confirm the SVG matches the emoji footprint and baseline. jsdom cannot measure
   this — the recent leaderboard grid bug shipped for exactly this reason.

## Definition of done

- The 6 SVGs are drawn and legibly distinct at 24px (light + dark).
- The picker has a Birds section; logging "Robin" stores `custom:robin`, shows a
  robin SVG at every render site (verified visually), pre-fills the name "Robin",
  and tracks as its own Top Critters row with the robin picture. A custom
  sighting with a cleared name still reads "Robin", never `custom:robin`.
- RSS titles and push notifications show the `🐦` stand-in (no feed image);
  over-length or unknown `custom:` emoji are rejected by **both** the sightings
  and profiles APIs; the catalogue-sync test passes.
- Full suite, lint, typecheck, build green; CI green on the PR.
