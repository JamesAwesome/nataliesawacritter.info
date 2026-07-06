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
  client `src/`): a `slug → standIn` map plus `standInFor(emoji)` and
  `customSlugOf(emoji): string | null`, and the set of known slugs for
  validation. This duplicates only the 6 stand-in pairs (stable, tiny).

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
- **Integrate `CritterGlyph`** everywhere a raw `{emoji}` is printed: the emoji
  picker tiles + recently-seen + friends rows, `DetailsForm` (the chosen critter
  header), `SightingDetail`, `SightingRow`, `CalendarPane` day cells,
  `LeaderboardList`, and `LogSightingFlow`/`DayDetail` as applicable. Sizing
  stays via the existing classes; the SVG `<img>` fills the same box (add
  `.critter-glyph { width: 1em; height: 1em; object-fit: contain; vertical-align: -0.15em }`
  or per-site sizing so images match the emoji footprint).
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

- **Validation** (`app/server/sightings/routes.ts`): raise the `emoji` length cap
  from `16` to `40` (tokens like `custom:chickadee` need room), and — for a
  `custom:` value — reject it unless the slug is in the server's known set (400
  validation error), so only shipped custom emoji can be stored.
- **RSS** (`buildFeed.ts`): the item **title** uses `standInFor(sighting.emoji)`
  instead of the raw emoji; the item **description** additionally embeds
  `<img src="${siteUrl}/custom-emoji/${slug}.svg" alt="" />` when the sighting is
  custom (via `customSlugOf`), so readers see the real robin.
- **Push** (`notifier.ts` `payloadFor`): the title uses
  `standInFor(sighting.emoji)`; the notification icon stays the app paw.

## Testing

- **`customEmoji` (client + server)**: `customFor`/`tokenFor` round-trip;
  `standInFor` maps a known token to its stand-in, passes a Unicode emoji
  through unchanged, and falls back for an unknown custom token; `customSlugOf`.
- **`CritterGlyph`**: renders an `<img>` with the right `src` for a token; renders
  a text span for a Unicode emoji.
- **`nameFor`**: returns the custom name for a token, the curated name for a
  curated emoji, null otherwise.
- **`EmojiPicker`**: shows the Birds section; tapping a bird calls `onPick` with
  the `custom:<slug>` token and the name.
- **Leaderboard**: two custom birds (`custom:robin` "Robin", `custom:cardinal`
  "Cardinal") count as separate rows.
- **Server**: sightings POST accepts a known `custom:` token, rejects an unknown
  one and an over-length emoji; `buildFeed` title uses the stand-in and the
  description embeds the absolute SVG URL; `payloadFor` uses the stand-in.
- Full suite, lint, typecheck, build green; CI green.

## Out of scope

Upload / user-created custom emoji · a management UI · a DB table for custom
emoji · non-bird custom emoji (the catalogue is extensible later) · custom
notification icons · editing the catalogue at runtime.

## Definition of done

- The picker has a Birds section; logging "Robin" stores `custom:robin`, shows a
  robin SVG everywhere in the app, pre-fills the name "Robin", and tracks as its
  own Top Critters row with the robin picture.
- RSS titles/notifications show the `🐦` stand-in; the RSS description shows the
  robin image; over-length or unknown `custom:` emoji are rejected by the API.
- Full suite, lint, typecheck, build green; CI green on the PR.
