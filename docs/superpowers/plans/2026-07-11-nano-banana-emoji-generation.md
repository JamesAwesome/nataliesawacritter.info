# Nano-banana emoji generation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the emoji sidecar generate critter art with Gemini 2.5 Flash Image ("nano banana") — via two deterministic CLIs the agent calls — with a copyright vision-check and a hand-draw fallback.

**Architecture:** Two testable modules + thin CLIs installed on the sidecar container PATH: `gen-emoji-art` (Gemini image call) and `matte-emoji` (flood-fill → transparent → data-URI SVG, the red-panda recipe). The existing `claude -p` agent, following the updated `adding-a-critter-emoji` skill, screens the request, generates, *looks at* the result (vision safety-check), mattes/embeds, wires the catalogues, and opens a PR — falling back to hand-drawing an SVG when the key is absent or generation fails.

**Tech Stack:** Node 26 (global `fetch`), TypeScript run via `tsx` (no build), vitest, ImageMagick (system), Gemini API.

**Spec:** `docs/superpowers/specs/2026-07-11-nano-banana-emoji-generation.md`

## Global Constraints

- Sidecar is **ESM TypeScript run via `tsx`** — no build step; imports are **extensionless** (bundler resolution). Do NOT add `.js` extensions.
- Follow the existing **injected-seam** pattern: pass `fetch`/`exec`/fs functions in, so modules are unit-testable with no network, no ImageMagick, no filesystem writes to the repo.
- **No new npm dependencies** (uses global `fetch` + node builtins; ImageMagick is a Dockerfile system package).
- **Deny-by-default:** `GEMINI_API_KEY` is optional; absent = the CLI exits non-zero so the agent falls back to hand-draw.
- **Model:** `gemini-2.5-flash-image`. **Retries:** the agent tries generation **3** times before fallback (enforced by the skill, not code).
- **Copyright:** Rule 1 pre-screen stays first; the generation prompt carries an originality clause; the agent's post-generation vision check is the third layer. Any layer → `skipped-copyright`.
- Generated art paths (relative to the agent's cwd = the app-repo worktree root): emoji `app/public/custom-emoji/<slug>.svg`, kept source `docs/renders/<slug>-source.png`.

## File Structure

- **Modify `sidecar/src/config.ts`** — add optional `geminiApiKey`.
- **Create `sidecar/src/genArt.ts`** — `buildEmojiPrompt(animal)` + `generateEmojiArt(...)` (injected `fetch`/`writeFile`).
- **Create `sidecar/src/tools/gen-emoji-art.ts`** — CLI wrapper (real fetch + env key).
- **Create `sidecar/src/matte.ts`** — `matteEmoji(...)` (injected `exec`/fs): ImageMagick pipeline → data-URI SVG + kept source PNG.
- **Create `sidecar/src/tools/matte-emoji.ts`** — CLI wrapper (real exec + fs).
- **Modify `sidecar/Dockerfile`** — install ImageMagick; install the two CLIs on PATH.
- **Modify `compose.yml`, `.env.example`** — wire `GEMINI_API_KEY`.
- **Modify `sidecar/src/task.ts`** — one line pointing the agent at generate-or-draw (skill-driven).
- **Modify `.claude/skills/adding-a-critter-emoji/SKILL.md`** — the generate→vision-check→matte→embed path, hand-draw fallback, Rule 1 first.

---

### Task 1: config — optional `geminiApiKey`

**Files:** Modify `sidecar/src/config.ts`; Test `sidecar/src/config.test.ts`

**Interfaces:** Produces `SidecarConfig.geminiApiKey?: string`.

- [ ] **Step 1: Write the failing tests** — append to `config.test.ts`:

```ts
it('reads GEMINI_API_KEY when present', () => {
  expect(parseConfig({ ...full, GEMINI_API_KEY: 'g-123' }).geminiApiKey).toBe('g-123')
})

it('leaves geminiApiKey undefined when absent or blank (fallback mode)', () => {
  expect(parseConfig(full).geminiApiKey).toBeUndefined()
  expect(parseConfig({ ...full, GEMINI_API_KEY: '' }).geminiApiKey).toBeUndefined()
})
```

- [ ] **Step 2: Run, watch fail**

Run: `cd sidecar && node_modules/.bin/vitest run src/config.test.ts`
Expected: FAIL (`geminiApiKey` is not on the config).

- [ ] **Step 3: Implement** — in `config.ts`, add the field to the type and parse it:

```ts
// in SidecarConfig:
  /** Gemini image API key ("nano banana"). Absent → the sidecar hand-draws. */
  geminiApiKey?: string
```
```ts
// in the returned object (after allowedCommenters):
    geminiApiKey: (env.GEMINI_API_KEY ?? '') === '' ? undefined : env.GEMINI_API_KEY,
```

- [ ] **Step 4: Run, watch pass**

Run: `node_modules/.bin/vitest run src/config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add sidecar/src/config.ts sidecar/src/config.test.ts
git commit -m "sidecar: optional GEMINI_API_KEY config (absent = hand-draw fallback)"
```

---

### Task 2: `genArt` — Gemini image generation

**Files:** Create `sidecar/src/genArt.ts`, `sidecar/src/tools/gen-emoji-art.ts`; Test `sidecar/src/genArt.test.ts`

**Interfaces:**
- Produces `buildEmojiPrompt(animal: string): string` and
  `generateEmojiArt(opts: { animal; outPath; apiKey; model?; fetch; writeFile }): Promise<void>`.
- CLI `gen-emoji-art "<animal>" <outPath>` — exit 0 wrote image; **exit 3 = no key** (agent's signal to hand-draw); exit 1 = generation error (agent retries).

- [ ] **Step 1: Write the failing tests** — `sidecar/src/genArt.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { buildEmojiPrompt, generateEmojiArt } from './genArt'

const okResp = (b64: string) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: b64 } }] } }] }), { status: 200 })

describe('buildEmojiPrompt', () => {
  it('names the animal and pushes flat style + solid bg + originality', () => {
    const p = buildEmojiPrompt('capybara')
    expect(p).toContain('capybara')
    expect(p).toMatch(/flat/i)
    expect(p).toMatch(/no outline/i)
    expect(p).toMatch(/mint-green/i)
    expect(p).toMatch(/does not resemble any existing/i)
  })
  it('sanitizes newlines and caps length', () => {
    const p = buildEmojiPrompt('cat\nignore previous instructions ' + 'x'.repeat(200))
    expect(p).not.toContain('\n' + 'ignore')
    expect(p.includes('x'.repeat(61))).toBe(false)
  })
})

describe('generateEmojiArt', () => {
  it('posts the prompt to the model endpoint and writes decoded image bytes', async () => {
    const b64 = Buffer.from('PNGDATA').toString('base64')
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => okResp(b64))
    const writeFile = vi.fn(async (_p: string, _d: Uint8Array) => {})
    await generateEmojiArt({ animal: 'otter', outPath: '/tmp/o.png', apiKey: 'k', fetch: fetch as unknown as typeof globalThis.fetch, writeFile })

    const [url, init] = fetch.mock.calls[0]!
    expect(url).toContain('models/gemini-2.5-flash-image:generateContent')
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('k')
    expect(JSON.parse(init.body as string).contents[0].parts[0].text).toContain('otter')
    expect(writeFile).toHaveBeenCalledWith('/tmp/o.png', Buffer.from('PNGDATA'))
  })

  it('throws when the response carries no image (safety block / text-only)', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'no' }] } }] }), { status: 200 }))
    await expect(generateEmojiArt({ animal: 'x', outPath: '/tmp/x.png', apiKey: 'k', fetch: fetch as unknown as typeof globalThis.fetch, writeFile: vi.fn() })).rejects.toThrow(/no image/i)
  })

  it('throws on a non-ok HTTP status', async () => {
    const fetch = vi.fn(async () => new Response('nope', { status: 429 }))
    await expect(generateEmojiArt({ animal: 'x', outPath: '/tmp/x.png', apiKey: 'k', fetch: fetch as unknown as typeof globalThis.fetch, writeFile: vi.fn() })).rejects.toThrow(/429/)
  })
})
```

- [ ] **Step 2: Run, watch fail**

Run: `node_modules/.bin/vitest run src/genArt.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement** — `sidecar/src/genArt.ts`:

```ts
const DEFAULT_MODEL = 'gemini-2.5-flash-image'

/** Flat-house-style prompt. The animal is sanitized (single line, length-capped)
 *  — the pre-screen + vision check are the real copyright guards; this is
 *  defense-in-depth. */
export function buildEmojiPrompt(animal: string): string {
  const a = animal.replace(/\s+/g, ' ').trim().slice(0, 60)
  return `A flat vector emoji sticker of a ${a}, front-facing face, centered, bold simple shapes, minimal shading, no outline, no border, limited flat color palette, friendly and cute. Plain solid mint-green (#7bd88f) background filling the frame. No text, no watermark, no signature. Must be an original design that does not resemble any existing cartoon character, mascot, brand, or logo.`
}

/** Calls the Gemini image model and writes the PNG. Throws on HTTP error or a
 *  response with no image (safety block / text-only) so the caller can retry.
 *  `fetch`/`writeFile` injected for testability. Verify the request/response
 *  shape against current Gemini API docs. */
export async function generateEmojiArt(opts: {
  animal: string
  outPath: string
  apiKey: string
  model?: string
  fetch: typeof globalThis.fetch
  writeFile: (path: string, data: Uint8Array) => Promise<void>
}): Promise<void> {
  const model = opts.model ?? DEFAULT_MODEL
  const res = await opts.fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': opts.apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: buildEmojiPrompt(opts.animal) }] }] }),
  })
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string } }> } }>
  }
  const b64 = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data
  if (!b64) throw new Error('gemini returned no image (safety block or text-only response)')
  await opts.writeFile(opts.outPath, Buffer.from(b64, 'base64'))
}
```

- [ ] **Step 4: Run, watch pass**

Run: `node_modules/.bin/vitest run src/genArt.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the CLI** — `sidecar/src/tools/gen-emoji-art.ts`:

```ts
import { writeFile } from 'node:fs/promises'
import { generateEmojiArt } from '../genArt'

const [animal, outPath] = process.argv.slice(2)
const apiKey = process.env.GEMINI_API_KEY
if (!animal || !outPath) {
  console.error('usage: gen-emoji-art "<animal>" <outPath>')
  process.exit(2)
}
if (!apiKey) {
  console.error('gen-emoji-art: GEMINI_API_KEY not set — caller should hand-draw instead')
  process.exit(3)
}
try {
  await generateEmojiArt({ animal, outPath, apiKey, fetch: globalThis.fetch, writeFile })
  console.log(`wrote ${outPath}`)
} catch (err) {
  console.error(`gen-emoji-art: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}
```

- [ ] **Step 6: Verify the CLI typechecks and commit**

Run: `node_modules/.bin/tsc --noEmit`
Expected: clean.
```bash
git add sidecar/src/genArt.ts sidecar/src/genArt.test.ts sidecar/src/tools/gen-emoji-art.ts
git commit -m "sidecar: gen-emoji-art — Gemini image generation with flat-style prompt"
```

---

### Task 3: `matte` — flood-fill to a data-URI SVG (keeps source)

**Files:** Create `sidecar/src/matte.ts`, `sidecar/src/tools/matte-emoji.ts`; Test `sidecar/src/matte.test.ts`

**Interfaces:**
- Produces `matteEmoji(opts: { inPath; slug; label; exec; readFile; writeFile; mkdir; copyFile }): Promise<{ svgPath; sourcePath }>`.
- CLI `matte-emoji <inPath> <slug> "<label>"` → writes `app/public/custom-emoji/<slug>.svg` + `docs/renders/<slug>-source.png` (relative to cwd), prints both paths.
- `Exec` type mirrors the sidecar's existing one: `(cmd, args, opts) => Promise<{ code; stdout; stderr }>`.

- [ ] **Step 1: Write the failing tests** — `sidecar/src/matte.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { matteEmoji } from './matte'

function deps(execResult = { code: 0, stdout: '', stderr: '' }) {
  return {
    exec: vi.fn(async (_c: string, _a: string[], _o: { cwd?: string }) => execResult),
    readFile: vi.fn(async (_p: string) => Buffer.from('PNGBYTES')),
    writeFile: vi.fn(async (_p: string, _d: string | Uint8Array) => {}),
    mkdir: vi.fn(async (_p: string, _o: { recursive: true }) => undefined),
    copyFile: vi.fn(async (_a: string, _b: string) => {}),
  }
}

describe('matteEmoji', () => {
  it('runs the flood-fill/trim/square/resize pipeline and writes a data-URI SVG + kept source', async () => {
    const d = deps()
    const res = await matteEmoji({ inPath: 'gen.png', slug: 'red-panda', label: 'Red panda', ...d })

    expect(res).toEqual({ svgPath: 'app/public/custom-emoji/red-panda.svg', sourcePath: 'docs/renders/red-panda-source.png' })
    const args = d.exec.mock.calls[0]![1].join(' ')
    expect(d.exec.mock.calls[0]![0]).toBe('magick')
    expect(args).toContain('floodfill')
    expect(args).toContain('-fuzz 10%') // validated: 22% ate pale/outline-less subjects
    expect(args).toContain('-trim')
    expect(args).toContain('256x256')
    // SVG wrapper: viewBox, aria-label, base64 data URI of the read bytes
    const svg = d.writeFile.mock.calls[0]![1] as string
    expect(d.writeFile.mock.calls[0]![0]).toBe('app/public/custom-emoji/red-panda.svg')
    expect(svg).toContain('viewBox="0 0 64 64"')
    expect(svg).toContain('aria-label="Red panda"')
    expect(svg).toContain('data:image/png;base64,' + Buffer.from('PNGBYTES').toString('base64'))
    // kept source
    expect(d.mkdir).toHaveBeenCalledWith('docs/renders', { recursive: true })
    expect(d.copyFile).toHaveBeenCalledWith('gen.png', 'docs/renders/red-panda-source.png')
  })

  it('throws when magick fails', async () => {
    const d = deps({ code: 1, stdout: '', stderr: 'boom' })
    await expect(matteEmoji({ inPath: 'g.png', slug: 's', label: 'S', ...d })).rejects.toThrow(/magick/i)
  })
})
```

- [ ] **Step 2: Run, watch fail**

Run: `node_modules/.bin/vitest run src/matte.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement** — `sidecar/src/matte.ts`:

```ts
export type Exec = (cmd: string, args: string[], opts: { cwd?: string }) => Promise<{ code: number; stdout: string; stderr: string }>

/** Turns a generated PNG (solid background) into the emoji SVG the app serves:
 *  flood-fill the background transparent, trim, square, downscale to 256px, and
 *  embed as a data-URI inside a 64x64 SVG. Also keeps the raw generated image at
 *  docs/renders/<slug>-source.png for provenance. Paths are relative to cwd (the
 *  app-repo worktree root). fs/exec injected for testability. */
export async function matteEmoji(opts: {
  inPath: string
  slug: string
  label: string
  cwd?: string
  exec: Exec
  readFile: (p: string) => Promise<Buffer>
  writeFile: (p: string, data: string | Uint8Array) => Promise<void>
  mkdir: (p: string, o: { recursive: true }) => Promise<unknown>
  copyFile: (a: string, b: string) => Promise<void>
}): Promise<{ svgPath: string; sourcePath: string }> {
  const svgPath = `app/public/custom-emoji/${opts.slug}.svg`
  const sourcePath = `docs/renders/${opts.slug}-source.png`
  const tmp = `/tmp/${opts.slug}-emoji-256.png`

  const r = await opts.exec(
    'magick',
    [
      // fuzz 10%: validated on a real pale, outline-less generation — 22% flood-
      // filled through the anti-aliased edge and ate the light subject; 10%
      // removes the flat mint background cleanly while keeping the body.
      opts.inPath, '-alpha', 'set', '-fuzz', '10%', '-fill', 'none',
      '-draw', 'alpha 0,0 floodfill',
      '-draw', 'alpha %[fx:w-1],0 floodfill',
      '-draw', 'alpha 0,%[fx:h-1] floodfill',
      '-draw', 'alpha %[fx:w-1],%[fx:h-1] floodfill',
      '-trim', '+repage',
      '-resize', '500x500', '-background', 'none', '-gravity', 'center', '-extent', '512x512',
      '-resize', '256x256', '-strip', tmp,
    ],
    { cwd: opts.cwd },
  )
  if (r.code !== 0) throw new Error(`magick failed (${r.code}): ${r.stderr.slice(0, 200)}`)

  const b64 = (await opts.readFile(tmp)).toString('base64')
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="${opts.label}">` +
    `<image href="data:image/png;base64,${b64}" width="64" height="64"/></svg>\n`
  await opts.writeFile(svgPath, svg)
  await opts.mkdir('docs/renders', { recursive: true })
  await opts.copyFile(opts.inPath, sourcePath)
  return { svgPath, sourcePath }
}
```

- [ ] **Step 4: Run, watch pass**

Run: `node_modules/.bin/vitest run src/matte.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the CLI** — `sidecar/src/tools/matte-emoji.ts`:

```ts
import { execFile } from 'node:child_process'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { matteEmoji, type Exec } from '../matte'

const pexec = promisify(execFile)
const exec: Exec = async (cmd, args, o) => {
  try {
    const { stdout, stderr } = await pexec(cmd, args, { cwd: o.cwd, maxBuffer: 32 * 1024 * 1024 })
    return { code: 0, stdout, stderr }
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string }
    return { code: typeof e.code === 'number' ? e.code : 1, stdout: e.stdout ?? '', stderr: e.stderr ?? String(err) }
  }
}

const [inPath, slug, label] = process.argv.slice(2)
if (!inPath || !slug || !label) {
  console.error('usage: matte-emoji <inPath> <slug> "<label>"')
  process.exit(2)
}
try {
  const { svgPath, sourcePath } = await matteEmoji({ inPath, slug, label, exec, readFile, writeFile, mkdir, copyFile })
  console.log(`${svgPath}\n${sourcePath}`)
} catch (err) {
  console.error(`matte-emoji: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}
```

- [ ] **Step 6: Typecheck + full suite, commit**

Run: `node_modules/.bin/tsc --noEmit && node_modules/.bin/vitest run`
Expected: clean; all tests pass.
```bash
git add sidecar/src/matte.ts sidecar/src/matte.test.ts sidecar/src/tools/matte-emoji.ts
git commit -m "sidecar: matte-emoji — flood-fill generated art to a data-URI SVG, keep source"
```

---

### Task 4: container + env wiring

**Files:** Modify `sidecar/Dockerfile`, `compose.yml`, `.env.example`

**Interfaces:** Consumes the two CLIs (Task 2/3). Produces `gen-emoji-art`/`matte-emoji` on the container PATH and `GEMINI_API_KEY` in the agent's env.

- [ ] **Step 1: Dockerfile — add ImageMagick** to the first apt-get install list (the `git curl ca-certificates gosu chromium …` line), inserting `imagemagick` among the packages.

- [ ] **Step 2: Dockerfile — install the two CLIs on PATH.** After `COPY . .` and before the entrypoint lines, add:

```dockerfile
# Emoji-art tools on PATH so the agent (running in the app-repo worktree) can
# call them. They run the sidecar's own TS via tsx (installed as a devDep above).
RUN printf '#!/bin/sh\nexec /app/node_modules/.bin/tsx /app/src/tools/gen-emoji-art.ts "$@"\n' > /usr/local/bin/gen-emoji-art \
 && printf '#!/bin/sh\nexec /app/node_modules/.bin/tsx /app/src/tools/matte-emoji.ts "$@"\n' > /usr/local/bin/matte-emoji \
 && chmod +x /usr/local/bin/gen-emoji-art /usr/local/bin/matte-emoji
```

- [ ] **Step 3: compose.yml — pass the key** to the `sidecar` service `environment:` block (after `SIDECAR_ALLOWED_COMMENTERS`):

```yaml
      GEMINI_API_KEY: ${GEMINI_API_KEY:-}
```

- [ ] **Step 4: .env.example — document it** (after the `SIDECAR_ALLOWED_COMMENTERS` block):

```
# Gemini image API key ("nano banana") for generated emoji art. Empty → the
# sidecar hand-draws SVGs instead. Model: gemini-2.5-flash-image.
GEMINI_API_KEY=
```

- [ ] **Step 5: Validate the image builds** (sidecar image isn't built in CI):

Run: `docker build -t sidecar-art-test sidecar/ && docker run --rm sidecar-art-test sh -c 'command -v magick && command -v gen-emoji-art && command -v matte-emoji'`
Expected: build succeeds; all three paths print. (If Docker is unavailable locally, note it and rely on a manual build before deploying the sidecar profile.)

- [ ] **Step 6: Commit**

```bash
git add sidecar/Dockerfile compose.yml .env.example
git commit -m "sidecar: install ImageMagick + emoji-art CLIs, wire GEMINI_API_KEY"
```

---

### Task 5: skill + task prompt — the generate path

**Files:** Modify `.claude/skills/adding-a-critter-emoji/SKILL.md`, `sidecar/src/task.ts`; Test `sidecar/src/task.test.ts`

**Interfaces:** Consumes the CLIs + fallback contract. Produces the agent behavior: screen → generate (3 tries) → vision-check → matte/embed → wire → PR; hand-draw when `gen-emoji-art` is absent or exits 3.

**Testing note (writing-skills discipline):** this is a skill edit, so gate it with subagent pressure tests — a baseline run (no skill / old skill) vs the edited skill — confirming the agent (a) screens copyrighted requests first, (b) prefers `gen-emoji-art` when present, (c) runs the vision check and refuses recognizable characters/logos, (d) falls back to hand-draw when the CLI is absent/exits 3. Capture the rationalizations and close them in the skill text.

- [ ] **Step 1: Add a generation section to the skill.** After "Rule 1" and before/within the recipe, document:
  - **Art source — generate if available, else draw.** If `gen-emoji-art` is on PATH, use it (it needs `GEMINI_API_KEY`); if the command is missing or exits 3, hand-draw the SVG per Rule 2. Rule 1 screening happens **before** either.
  - **The generate loop:** `gen-emoji-art "<animal>" gen.png` → **look at `gen.png`** (Read it): is it a clear, original critter, and NOT a recognizable character / mascot / brand / logo? If unsafe → `RESULT: skipped-copyright`. If poor but safe → regenerate, **up to 3 attempts total**, then fall back to hand-draw. When good → `matte-emoji gen.png <slug> "<Name>"` (writes the SVG + keeps the source), then wire the catalogues and open the PR with both the render and `docs/renders/<slug>-source.png`.
  - Keep Rule 2's render gate (render the resulting `<slug>.svg` and attach it).

- [ ] **Step 2: Add a one-line hint to `task.ts`.** Write the failing test first — append to `sidecar/src/task.test.ts`:

```ts
it('points the agent at the generate-or-draw choice', () => {
  const t = buildTask({ id: 'x', name: 'Otter', note: null })
  expect(t).toMatch(/gen-emoji-art/)
})
```
Run it (fails), then in `task.ts` add a line to the task string (near the skill/render instructions), e.g.:
```
'If `gen-emoji-art` is available use it to generate the art (then `matte-emoji`),',
'otherwise draw the SVG by hand — the adding-a-critter-emoji skill explains both.',
```
Run the test (passes).

- [ ] **Step 3: Run the skill subagent tests** (baseline vs edited) described in the testing note; iterate the skill text until the agent screens-first, prefers generation, vision-checks, and falls back correctly.

- [ ] **Step 4: Full sidecar suite + typecheck**

Run: `cd sidecar && node_modules/.bin/tsc --noEmit && node_modules/.bin/vitest run`
Expected: clean; all pass.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/adding-a-critter-emoji/SKILL.md sidecar/src/task.ts sidecar/src/task.test.ts
git commit -m "skill: generate emoji art with nano banana (vision-checked), hand-draw fallback"
```

---

## Self-Review

**Spec coverage:**
- Agent-orchestrated + two CLIs → Tasks 2/3/4. ✓
- Flat-style prompt → Task 2 (`buildEmojiPrompt`). ✓
- Three-layer copyright safety (pre-screen, prompt clause, vision check) → prompt in Task 2, screen + vision check in Task 5 (skill). ✓
- Flood-fill matte → data-URI SVG (red-panda recipe) → Task 3. ✓
- Keep source PNG (`docs/renders/<slug>-source.png`) → Task 3. ✓
- Fallback to hand-draw (no key / exit 3 / 3 failed tries) → CLI exit codes (Task 2) + skill (Task 5). ✓
- Config `GEMINI_API_KEY` deny-by-default → Task 1. ✓
- Container: ImageMagick + CLIs + env → Task 4. ✓
- Model `gemini-2.5-flash-image`, retries 3 → Task 2 default + skill (Task 5). ✓

**Placeholder scan:** none — concrete code/commands throughout. The Gemini request/response shape carries an explicit "verify against docs" note (image APIs evolve), not a placeholder.

**Type/name consistency:** `generateEmojiArt`/`buildEmojiPrompt` (Task 2) and `matteEmoji` signature + `Exec` type (Task 3) match their tests and CLIs; CLI names `gen-emoji-art`/`matte-emoji` match the Dockerfile (Task 4), the skill, and the `task.ts` hint (Task 5); paths `app/public/custom-emoji/<slug>.svg` + `docs/renders/<slug>-source.png` are identical across Task 3 and Task 5.
