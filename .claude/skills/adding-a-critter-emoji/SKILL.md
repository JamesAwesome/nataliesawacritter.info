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

## Art source: generate if available, else draw

Two ways to produce the art. **Rule 1's screening always happens first** — before
generation or drawing — because screening is about the *request*, not the
pixels a model or a hand might produce from it.

- **Preferred — generate.** If `gen-emoji-art` is on your PATH, use it (it calls
  Gemini 2.5 Flash Image and needs `GEMINI_API_KEY` set in the environment).
- **Fallback — hand-draw.** If the command is missing, or it **exits 3** (no key
  configured), skip straight to drawing the SVG by hand per Rule 2's art-style
  guidance below — that's the deploy's deny-by-default fallback, not an error
  worth reporting.

**The generate loop:**

1. Run `gen-emoji-art "<animal>" gen.png`. It writes a flat-style PNG on a
   solid mint-green background, or exits non-zero: `3` = no key → hand-draw
   instead; `1` = a generation error → retry (counts toward the budget below).
2. **Look at `gen.png`** — Read the file; this is a vision check, not a
   file-exists check. Judge it against the same bar as Rule 1: is it a clear,
   original critter, and **not** a recognizable character, mascot, brand, or
   logo?
   - **Unsafe** (recognizable IP, even loosely) → stop, don't regenerate hoping
     for a safer roll — `RESULT: skipped-copyright`, same as a pre-screen
     refusal.
   - **Safe but poor** (malformed, off-model, wrong animal, illegible at small
     size) → regenerate. **Up to 3 attempts total** across the request. Still
     no good-and-safe image after 3 → fall back to hand-drawing instead of
     shipping weak art.
   - **Good** → continue.
3. Run `matte-emoji gen.png <slug> "<Name>"`. It flood-fills the background
   transparent, trims/squares/downscales, and writes
   `app/public/custom-emoji/<slug>.svg` directly — plus keeps the raw
   generation at `docs/renders/<slug>-source.png` for provenance. Pick up the
   recipe below at the catalogue-wiring step; the SVG is already in place, so
   there's nothing to hand-draw.
4. When you open the PR, attach **both** images: the rendered `<slug>.svg`
   (Rule 2's render gate, unchanged — a generated SVG needs the same real-browser
   check as a hand-drawn one) and `docs/renders/<slug>-source.png`.

The vision check is a real safety layer, not a formality: the generation
prompt pushes originality, but an image model will still draw a recognizable
character if the request nudges it there. Default to refusing on doubt, same
as Rule 1.

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
  human approves at review time. Never auto-merge emoji art. Commit the render
  (e.g. `docs/renders/<slug>-emoji-render.png`) and embed it in the PR body by a
  **commit-pinned** raw URL — `https://raw.githubusercontent.com/<owner>/<repo>/<sha>/<path>`
  using the pushed commit's `git rev-parse HEAD`, **not** a branch-pinned URL.
  GitHub caches PR images by URL, so a branch-pinned link goes stale after a
  later push (e.g. an `/iterate`); a commit-pinned one changes every push.

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
   - `public/custom-emoji/<slug>.svg` — the art: generate + matte (see above)
     if available, else hand-draw per Rule 2's style guidance.
   - `src/lib/customEmoji.ts` — a `CUSTOM` entry `{ slug, name, standIn, category }` (append **in the same order** as the client test).
   - `server/customEmoji.ts` — a `STAND_INS` entry `<slug>: '<standIn>'`.
3. **Verify:** `pnpm test` (or `test:coverage`), `pnpm lint`, `pnpm typecheck`.
   Drift-guard tests assert client ⇔ server ⇔ on-disk agree; `emojiCategories`
   auto-derives the picker group and is coverage-checked — no edit needed there.
4. **Ship:** squash-merged PR with the render attached (plus the kept source
   PNG, `docs/renders/<slug>-source.png`, when the art was generated); wait for
   CI green.

Nothing else references the catalogue — no README/count to bump, no
`CritterGlyph` change (it renders `custom:<slug>` as `/custom-emoji/<slug>.svg`
automatically once the entry exists).

## Quick reference

| File | Change |
|---|---|
| `public/custom-emoji/<slug>.svg` | new art — generated (`gen-emoji-art` + `matte-emoji`) or hand-drawn |
| `docs/renders/<slug>-source.png` | kept source PNG (generated art only) |
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
- Skipping the vision check on generated art, or regenerating past the
  3-attempt budget instead of falling back to hand-drawing.
- Treating `gen-emoji-art` exit 3 (no key) as an error to report instead of the
  fallback signal it is — just hand-draw.
