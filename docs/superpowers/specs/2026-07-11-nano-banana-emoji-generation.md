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
- **Retries:** exactly **3** generation attempts per request before falling back.
- **Model/key:** model `gemini-2.5-flash-image`, key `GEMINI_API_KEY` (already set
  in `.env` for testing).
- **Provenance:** **keep the generated source PNG**, committed alongside the emoji
  (e.g. `docs/renders/<slug>-source.png`) and linked in the PR.

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

`gen-emoji-art "<subject>"` builds the prompt from a **subject description that
includes the composition** (agent-chosen, sanitized) — *not* a hardcoded face, so
a pelican or horseshoe crab gets a full body:

> "A flat vector emoji sticker of **{subject}**, centered and filling the frame,
> bold simple shapes, minimal shading, **no outline, no border**, limited flat
> color palette, friendly and cute. Plain solid **mint-green (#7bd88f)**
> background, filling the frame. No text, no watermark, no signature. Must be an
> **original** design that does **not** resemble any existing cartoon character,
> mascot, brand, or logo."

- `{subject}` is e.g. `a full-body pelican, side view` or `a red panda's face`.
  **Prefer full body**; face only for critters whose face is the iconic form
  (some mammals). The skill picks per critter.
- Solid mint-green (a color absent from typical critters) → clean color-key matte.
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

## Post-process (matte) — validated on the real container

`matte-emoji <in.png> <slug> "<label>"` (ImageMagick). Sample the background color
from a corner (the model's actual mint drifts from the requested `#7bd88f`), then
key it out — portable across ImageMagick 6 (the container ships IM6) and 7:

    BG=$(magick in.png -format '%[pixel:p{0,0}]' info:)     # e.g. srgb(166,211,181)
    magick in.png -fuzz 12% -transparent "$BG" \
      -trim +repage -resize 500x500 -background none -gravity center -extent 512x512 \
      -resize 256x256 -strip out256.png

Then base64-embed into `<svg viewBox="0 0 64 64" …><image href="data:image/png;base64,…" width="64" height="64"/></svg>` at `app/public/custom-emoji/<slug>.svg` (~65–100KB, verified to render through the pipeline). The label is XML-escaped and the slug is validated `^[a-z0-9-]+$` (untrusted).

Rationale: the IM7-only `-draw "alpha … floodfill"` doesn't exist in the container's
IM6, and at high fuzz it ate pale, outline-less subjects. `-fuzz 12% -transparent
<sampled-bg>` keys out only the (solid) background color and keeps a non-mint
subject — validated end-to-end in the IM6 container. A green critter (near mint)
is the known edge case; the agent's render gate catches a bad matte.

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

## Resolved (from spec review)

- Model `gemini-2.5-flash-image`; `GEMINI_API_KEY` already in `.env` for testing.
- Retry budget: **3**, then hand-draw fallback.
- **Keep** the generated source PNG: `matte-emoji` also writes the raw generated
  image to `docs/renders/<slug>-source.png` (committed), and the PR links it next
  to the rendered emoji.

## Out of scope / future

- Matting model (rembg) instead of flood-fill.
- Regenerating the existing emoji set for uniform style (accepting the mix for now).
- Multi-image pick-the-best (generate several, choose) — v1 is one image + retries.
