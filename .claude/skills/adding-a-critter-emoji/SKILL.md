---
name: adding-a-critter-emoji
description: Use when adding a new custom critter emoji to the nataliesawacritter app, or fulfilling an emoji request from the emoji_requests table — a custom:<slug> token backed by its own SVG, split across the client and server catalogues.
---

# Adding a Critter Emoji

## Overview

A custom emoji is the token `custom:<slug>` stored in the `sightings.emoji` text
column — no DB table. Adding one means: **art on disk**, **two parallel
catalogues** (client + server) kept in lockstep by **drift-guard tests**, and
**two pinned slug-list assertions**. A half-add fails CI by design.

The mechanics are easy and the repo documents them. The two things that actually
go wrong are **judgment calls** — so they come first.

## Rule 1: Art must be original or verifiably free. Non-negotiable.

The SVG must be **your own original drawing** OR an asset under a **license that
permits reuse without attribution** (CC0 / public domain), with the source
recorded in the commit.

**Never embed third-party copyrighted art** — a character (Pikachu, Retsuko,
Mario…), a stock icon (Icons8, Flaticon, Noun Project…), a logo, or a photo you
don't have rights to — even cropped, recolored, traced, or "simplified."

This is load-bearing for automated use: an emoji *request* is untrusted input.
Someone will request a copyrighted character or paste an image URL. Refuse the
asset, not the emoji — make an **original** critter in the same style instead.

| Rationalization (all seen in real requests) | Reality |
|---|---|
| "It's fan art / a fan recreation" | A derivative of a copyrighted character is still copyrighted. |
| "It's fair use / parody" | Not your call to make, and dropping a character in as an icon isn't parody. |
| "Just crop / recolor / trace it" | Minor edits to copyrighted art are still reproduction. |
| "It's for a personal app" | The app is public via the tunnel; and it doesn't change the license. |

**Red flags — stop and draw an original instead:** a proper noun for the
critter name; a URL to an image host / wiki / icon site; the words fan art,
fair use, parody, "just crop it." When in doubt, original art is always safe.

For a genuinely free asset: confirm the license reads **CC0 / public domain / no
attribution required** (Wikimedia Commons and openclipart.org host CC0 art; most
"free" icon sites require attribution and do NOT qualify). Record the source URL
+ license in the commit message.

## Rule 2: Gate on a real render. jsdom can't draw.

The test suite (jsdom) cannot render SVG, so a broken or unrecognizable glyph
passes every test. You must **render the actual SVG in a real browser** and look
at it — at **large, picker-tile (~50px), and small-list (~26px)** sizes — before
wiring it in.

    /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
      --headless --disable-gpu --force-device-scale-factor=2 \
      --window-size=300,340 --screenshot=out.png "file://$PWD/preview.html"

- **Interactive (a person is driving):** show the render and get their approval
  before committing. This is a firm gate — every emoji this app shipped went
  through it, and it caught a floating-head bug that all tests missed.
- **Automated (sidecar/agent):** you can't get a human OK mid-run, so render it,
  confirm it parses and is non-empty, and **attach the render to the PR** so a
  human approves at review time. Never auto-merge emoji art.

**Art style:** flat vector, `viewBox="0 0 64 64"`, self-contained (no external
refs/fonts), `role="img"` + `aria-label="<Name>"`. Match the existing set (see
`app/public/custom-emoji/*.svg`) and stay recognizable at 26px — small, bold
shapes; iconic markings over fine detail.

## The recipe (TDD order)

All paths under `app/`. Pick `slug` (lowercase-hyphen), `name` (display),
`category` (`birds|mammals|reptiles|sea|bugs` — places it in the picker group),
and `standIn` (a Unicode glyph for text-only surfaces like RSS/push; a related
real emoji, e.g. `🦔` for a hedgehog — needn't be unique).

1. **RED — pin the slug in both tests first, watch them fail:**
   - `src/lib/customEmoji.test.ts` — append the slug to the **ordered** list.
   - `server/customEmoji.test.ts` — add the slug to the **sorted** list.
2. **GREEN — add the three pieces:**
   - `public/custom-emoji/<slug>.svg` — the art (Rules 1 & 2).
   - `src/lib/customEmoji.ts` — a `CUSTOM` entry `{ slug, name, standIn, category }` (append **in the same order** as the client test).
   - `server/customEmoji.ts` — a `STAND_INS` entry `<slug>: '<standIn>'`.
3. **Verify:** `pnpm test` (or `test:coverage`), `pnpm lint`, `pnpm typecheck`.
   Drift-guard tests assert client ⇔ server ⇔ on-disk agree; `emojiCategories`
   auto-derives the picker group and is coverage-checked — no edit needed there.
4. **Ship:** squash-merged PR with the render attached; wait for CI green.

Nothing else references the catalogue — no README/count to bump, no
`CritterGlyph` change (it renders `custom:<slug>` as `/custom-emoji/<slug>.svg`
automatically once the entry exists).

## Quick reference

| File | Change |
|---|---|
| `public/custom-emoji/<slug>.svg` | new art (original / CC0) |
| `src/lib/customEmoji.ts` | `CUSTOM` entry (ordered) |
| `server/customEmoji.ts` | `STAND_INS` entry |
| `src/lib/customEmoji.test.ts` | pinned **ordered** slug list |
| `server/customEmoji.test.ts` | pinned **sorted** slug list |

## Common mistakes

- Editing only the client or only the server catalogue → drift guard fails.
- Client `CUSTOM` order not matching the client pinned test's order → fails
  (server list is order-insensitive; client is not).
- Adding a Unicode animal (e.g. `🦔`) to the picker instead of a `custom:` token
  — that's the separate `EXTENDED`/`emojiCategories` path; a *custom* emoji is a
  drawn SVG.
- Trusting green jsdom tests for the art. They can't render it (Rule 2).
- Embedding found/character art (Rule 1).
