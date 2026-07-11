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
