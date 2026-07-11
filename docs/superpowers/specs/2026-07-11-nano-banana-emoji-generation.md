# Design: nano-banana image generation in the emoji sidecar

**Status:** approved design (brainstormed). Ready for an implementation plan.
**Date:** 2026-07-11

## Goal

Give the emoji-request sidecar much better art by generating each critter with
Google's **Gemini 2.5 Flash Image ("nano banana")** instead of hand-drawing an
SVG — while keeping the copyright safety that hand-drawn originals gave us, and
falling back to hand-drawing when generation isn't available.

## Decisions (from brainstorming)

- **Style:** prompt nano banana to **mimic the flat house style** (flat, bold
  simple shapes, minimal shading, no outline, limited palette) — not the shaded
  sticker look. A style mix is acceptable but we push for consistency.
- **Background removal:** **flood-fill** (cheap, proven — it's exactly the recipe
  used for the red-panda redraw). A matting model (rembg) is out of scope for v1.
- **Fallback:** no `GEMINI_API_KEY`, or generation fails / can't pass the safety
  check after the retries → the agent **hand-draws the original SVG** (today's
  path). The sidecar works with or without the key.
- **Retries:** ~3 generation attempts per request before falling back.
- **Model/key:** Gemini 2.5 Flash Image via the Gemini API, key supplied as
  `GEMINI_API_KEY` (owner to confirm on spec review).

## Architecture — agent-orchestrated

Keep the existing `claude -p` agent doing the whole job (screen → art → wire →
test → PR). Add two **deterministic CLI tools**, installed on the container PATH
by the sidecar image, that the agent calls; the agent's *judgment* drives
screening, the vision check, iteration, and fallback. Rationale: the agent can
**look at** the generated image (Claude vision), which is the copyright safety
net, and can iterate or fall back — a pure pipeline can't.

Updated agent flow (via the `adding-a-critter-emoji` skill):

1. **Screen** the request (Rule 1, unchanged): proper-noun / character / logo /
   brand / image-URL → `skipped-copyright`, before spending a generation.
2. **Generate:** `gen-emoji-art "<animal>" out.png` → calls Gemini with the
   flat-style prompt (below) and writes the image. If the command is absent
   (no key), skip to hand-draw.
3. **Vision-check:** the agent Reads `out.png` and judges — is it a clear,
   original critter, and **not** a recognizable character/logo/trademark? On
   doubt → regenerate (≤3 total). Still failing the safety check → `skipped-copyright`.
   Poor-but-safe art → regenerate within the budget; exhausted → hand-draw.
4. **Matte + embed:** `matte-emoji out.png <slug>` → flood-fill background to
   transparent, trim, square, 256px, wrap as a data-URI SVG at
   `app/public/custom-emoji/<slug>.svg`. No app change (renders via the existing
   `/custom-emoji/<slug>.svg` pipeline).
5. **Wire + gate + PR:** client + server catalogues, pinned slug lists,
   drift-guard tests, real-browser render, open the PR. **Never auto-merges.**

## The generation prompt (flat house style)

`gen-emoji-art` builds the prompt from the (fenced, untrusted) animal name:

> "A flat vector emoji sticker of a **{animal}**, front-facing face, centered,
> bold simple shapes, minimal shading, **no outline, no border**, limited flat
> color palette, friendly and cute. Plain solid **mint-green (#7bd88f)**
> background, filling the frame. No text, no watermark, no signature. Must be an
> **original** design that does **not** resemble any existing cartoon character,
> mascot, brand, or logo."

- Solid mint-green (a color absent from typical critters) → clean flood-fill.
- "no outline/border/text/watermark" → closer to the flat set + easier matting.
- The originality clause is defense-in-depth alongside the pre-screen + vision check.

## Three-layer copyright safety

Requests are untrusted; an image model will render IP if asked. Independent layers,
any of which routes to `skipped-copyright`:

1. **Pre-screen** (before generation) — existing Rule 1 red flags (proper noun,
   URL, character/brand/logo, "fair use").
2. **Constrained prompt** — the originality/no-character clause above; the animal
   name is data-fenced.
3. **Post-generation vision check** — the agent inspects the output and refuses
   anything recognizable as a character/logo/trademark, defaulting to refuse on doubt.

## Post-process (matte) — the proven recipe

`matte-emoji <in.png> <slug>` (ImageMagick), same steps validated on the red panda:

    magick in.png -alpha set -fuzz 22% -fill none \
      -draw "alpha 0,0 floodfill"  -draw "alpha %[fx:w-1],0 floodfill" \
      -draw "alpha 0,%[fx:h-1] floodfill" -draw "alpha %[fx:w-1],%[fx:h-1] floodfill" \
      -trim +repage -resize 500x500 -background none -gravity center -extent 512x512 \
      -resize 256x256 -strip out256.png

Then base64-embed into `<svg viewBox="0 0 64 64" …><image href="data:image/png;base64,…" width="64" height="64"/></svg>` at `app/public/custom-emoji/<slug>.svg` (~100KB, verified to render through the pipeline).

Flood-fill seeds from the four corners with fuzz, so it adapts to whatever solid
background the model produced (doesn't need an exact color match), and the flat
critter's own colors are interior (protected).

## Components / files

**Sidecar package (`sidecar/`):**
- `tools/genArt.ts` — `generateEmojiArt(animal, outPath, {fetch, apiKey, model})`: builds the prompt, calls the Gemini image API, writes the PNG. Injected `fetch` + `apiKey` for testability. Exposed as a `gen-emoji-art` CLI.
- `tools/matte.ts` — `matteEmoji(inPath, slug, {exec, appDir})`: runs the ImageMagick pipeline + writes the data-URI SVG. Injected `exec`. Exposed as a `matte-emoji` CLI.
- `config.ts` — add `geminiApiKey?: string` (from `GEMINI_API_KEY`; optional — absent = fallback mode).
- `Dockerfile` — install ImageMagick; install the two CLIs on PATH; pass `GEMINI_API_KEY` through.
- The agent's environment gets `GEMINI_API_KEY` so the CLI can auth.

**App repo:**
- `.claude/skills/adding-a-critter-emoji/SKILL.md` — add the generate→vision-check→matte→embed path as primary, hand-draw as fallback, Rule 1 still first. Document the two CLI commands and "if unavailable, hand-draw."

**Compose / env:** `GEMINI_API_KEY` wired into the `sidecar` service (deny-by-default: empty = fallback).

## Gemini API surface (pin exactly at implementation)

- Model: `gemini-2.5-flash-image` (the "nano banana" image model). Confirm the exact
  id + availability against current Gemini API docs when building.
- Request: `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
  with header `x-goog-api-key: $GEMINI_API_KEY`, body `{ "contents": [{ "parts": [{ "text": "<prompt>" }] }] }`.
- Response: image bytes as base64 in `candidates[0].content.parts[].inlineData.data`
  (mimeType `image/png`). Handle safety-block / empty responses → treat as a failed
  attempt (retry, then fall back).

## Testing

- **`genArt`** — mocked `fetch`: prompt contains the fenced animal + flat-style
  clauses; parses `inlineData` → writes bytes; a safety-blocked/empty response
  throws (→ agent retries). No real API calls.
- **`matte`** — mocked `exec`: asserts the flood-fill/trim/square/resize command
  and the data-URI SVG wrapper; a tiny real-`magick` smoke test (green-bg fixture →
  transparent) if ImageMagick is available in CI.
- **Skill** — TDD per the writing-skills discipline: a baseline agent (no skill)
  vs skill-equipped, confirming it screens first, prefers generation, vision-checks,
  and falls back to hand-draw when the CLI is absent.
- **Manual e2e:** a real request → sidecar generates, mattes, opens a PR with the
  render; a "Pikachu" request → `skipped-copyright` (pre-screen or vision check).

## Out of scope / future

- Matting model (rembg) instead of flood-fill.
- Regenerating the existing emoji set for uniform style (accepting the mix for now).
- Multi-image pick-the-best (generate several, choose) — v1 is one image + retries.

## Open questions

1. Exact Gemini model id + whether the key is a standard AI Studio key.
2. Retry budget (default 3).
3. Whether to keep generated PNGs (e.g. `docs/renders/`) for provenance beyond the PR.
