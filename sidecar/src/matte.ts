export type Exec = (cmd: string, args: string[], opts: { cwd?: string }) => Promise<{ code: number; stdout: string; stderr: string }>

const SLUG_RE = /^[a-z0-9-]+$/

/** XML-escape untrusted text before it goes into an SVG attribute (the label
 *  traces back to the untrusted request name, and the SVG is served as a
 *  document). */
function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Turns a generated PNG (solid background) into the emoji SVG the app serves:
 *  key out the background to transparent, trim, square, downscale to 256px, and
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
  // slug reaches a filesystem path — reject anything but [a-z0-9-] (no `..`, `/`).
  if (!SLUG_RE.test(opts.slug)) throw new Error(`matte: invalid slug '${opts.slug}' (expected [a-z0-9-]+)`)

  const svgPath = `app/public/custom-emoji/${opts.slug}.svg`
  const sourcePath = `docs/renders/${opts.slug}-source.png`
  const tmp = `/tmp/${opts.slug}-emoji-256.png`

  // Sample the background from a corner — the prompt asks for a solid background
  // filling the frame, and the model's actual color drifts from the requested
  // mint, so key out whatever it really produced.
  const probe = await opts.exec('magick', [opts.inPath, '-format', '%[pixel:p{0,0}]', 'info:'], { cwd: opts.cwd })
  if (probe.code !== 0) throw new Error(`magick probe failed (${probe.code}): ${probe.stderr.slice(0, 200)}`)
  const bg = probe.stdout.trim() || 'white'

  // `-transparent <color>` keys out the background. Portable across ImageMagick
  // 6 and 7 (the container ships IM6, whose `-draw "alpha … floodfill"` doesn't
  // exist). fuzz 12% absorbs the model's anti-aliasing; the (non-bg-colored)
  // subject is kept.
  const r = await opts.exec(
    'magick',
    [
      opts.inPath, '-fuzz', '12%', '-transparent', bg,
      '-trim', '+repage',
      '-resize', '500x500', '-background', 'none', '-gravity', 'center', '-extent', '512x512',
      '-resize', '256x256', '-strip', tmp,
    ],
    { cwd: opts.cwd },
  )
  if (r.code !== 0) throw new Error(`magick failed (${r.code}): ${r.stderr.slice(0, 200)}`)

  const b64 = (await opts.readFile(tmp)).toString('base64')
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="${xmlEscape(opts.label)}">` +
    `<image href="data:image/png;base64,${b64}" width="64" height="64"/></svg>\n`
  await opts.writeFile(svgPath, svg)
  await opts.mkdir('docs/renders', { recursive: true })
  await opts.copyFile(opts.inPath, sourcePath)
  return { svgPath, sourcePath }
}
