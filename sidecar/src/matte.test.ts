import { describe, expect, it, vi } from 'vitest'
import { matteEmoji } from './matte'

/** Mock exec: the probe call (`… info:`) returns the sampled bg color; every
 *  other call returns success. */
function deps(opts: { bg?: string; transformCode?: number } = {}) {
  const bg = opts.bg ?? 'srgb(166,211,181)'
  return {
    exec: vi.fn(async (_c: string, a: string[], _o: { cwd?: string }) =>
      a.includes('info:')
        ? { code: 0, stdout: bg, stderr: '' }
        : { code: opts.transformCode ?? 0, stdout: '', stderr: opts.transformCode ? 'boom' : '' },
    ),
    readFile: vi.fn(async (_p: string) => Buffer.from('PNGBYTES')),
    writeFile: vi.fn(async (_p: string, _d: string | Uint8Array) => {}),
    mkdir: vi.fn(async (_p: string, _o: { recursive: true }) => undefined),
    copyFile: vi.fn(async (_a: string, _b: string) => {}),
  }
}

describe('matteEmoji', () => {
  it('samples the bg, keys it out with -transparent, squares/resizes, writes a data-URI SVG + kept source', async () => {
    const d = deps()
    const res = await matteEmoji({ inPath: 'gen.png', slug: 'red-panda', label: 'Red panda', ...d })

    expect(res).toEqual({ svgPath: 'app/public/custom-emoji/red-panda.svg', sourcePath: 'docs/renders/red-panda-source.png' })

    // 1st exec = probe the corner pixel
    expect(d.exec.mock.calls[0]![0]).toBe('magick')
    expect(d.exec.mock.calls[0]![1].join(' ')).toContain('%[pixel:p{0,0}]')
    // 2nd exec = the transform (IM6/IM7-portable -transparent, NOT floodfill)
    const args = d.exec.mock.calls[1]![1].join(' ')
    expect(args).toContain('-transparent srgb(166,211,181)') // sampled bg
    expect(args).toContain('-fuzz 12%')
    expect(args).toContain('-trim')
    expect(args).toContain('256x256')
    expect(args).not.toContain('floodfill') // the IM7-only draw form is gone

    const svg = d.writeFile.mock.calls[0]![1] as string
    expect(d.writeFile.mock.calls[0]![0]).toBe('app/public/custom-emoji/red-panda.svg')
    expect(svg).toContain('viewBox="0 0 64 64"')
    expect(svg).toContain('aria-label="Red panda"')
    expect(svg).toContain('data:image/png;base64,' + Buffer.from('PNGBYTES').toString('base64'))
    expect(d.mkdir).toHaveBeenCalledWith('docs/renders', { recursive: true })
    expect(d.copyFile).toHaveBeenCalledWith('gen.png', 'docs/renders/red-panda-source.png')
  })

  it('XML-escapes the untrusted label in the aria-label', async () => {
    const d = deps()
    await matteEmoji({ inPath: 'g.png', slug: 'x', label: 'Cat & <script>"', ...d })
    const svg = d.writeFile.mock.calls[0]![1] as string
    expect(svg).toContain('aria-label="Cat &amp; &lt;script&gt;&quot;"')
    expect(svg).not.toContain('<script>')
  })

  it('rejects a slug that could escape the emoji directory', async () => {
    const d = deps()
    await expect(matteEmoji({ inPath: 'g.png', slug: '../evil', label: 'x', ...d })).rejects.toThrow(/invalid slug/i)
    expect(d.exec).not.toHaveBeenCalled()
  })

  it('throws when the transform magick call fails', async () => {
    const d = deps({ transformCode: 1 })
    await expect(matteEmoji({ inPath: 'g.png', slug: 's', label: 'S', ...d })).rejects.toThrow(/magick/i)
  })
})
