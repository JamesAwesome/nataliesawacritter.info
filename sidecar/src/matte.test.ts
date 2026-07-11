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
