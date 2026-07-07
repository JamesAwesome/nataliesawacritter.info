import { afterEach, describe, expect, it, vi } from 'vitest'
import { downscalePhoto, fitWithin } from './photo'

describe('fitWithin', () => {
  it('scales the long edge down to maxEdge proportionally', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 })
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 })
    expect(fitWithin(2000, 2000, 1600)).toEqual({ width: 1600, height: 1600 })
  })

  it('never upscales', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 })
  })

  it('rounds to integers with a 1px floor', () => {
    expect(fitWithin(3001, 100, 1600)).toEqual({ width: 1600, height: 53 })
    expect(fitWithin(10000, 1, 1600)).toEqual({ width: 1600, height: 1 })
  })
})

describe('downscalePhoto', () => {
  afterEach(() => vi.unstubAllGlobals())

  const makeBitmap = (width: number, height: number) => ({ width, height, close: vi.fn() })

  // Stub the browser image APIs jsdom lacks (createImageBitmap / OffscreenCanvas).
  function stubCanvas(opts: { ctxNull?: boolean } = {}) {
    const drawImage = vi.fn()
    const outBlob = new Blob(['jpeg-bytes'], { type: 'image/jpeg' })
    const convertToBlob = vi.fn(async () => outBlob)
    const sizes: Array<{ width: number; height: number }> = []
    class FakeOffscreenCanvas {
      convertToBlob = convertToBlob
      constructor(
        public width: number,
        public height: number,
      ) {
        sizes.push({ width, height })
      }
      getContext() {
        return opts.ctxNull === true ? null : { drawImage }
      }
    }
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas)
    return { drawImage, convertToBlob, outBlob, sizes }
  }

  it('re-encodes to a bounded jpeg at the fitWithin size and frees the bitmap', async () => {
    const bitmap = makeBitmap(2000, 1000)
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap))
    const env = stubCanvas()

    const result = await downscalePhoto(new Blob(['source']))

    expect(result).toBe(env.outBlob)
    expect(env.sizes).toEqual([{ width: 1600, height: 800 }]) // fitWithin(2000,1000,1600)
    expect(env.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1600, 800)
    expect(env.convertToBlob).toHaveBeenCalledWith({ type: 'image/jpeg', quality: 0.85 })
    expect(bitmap.close).toHaveBeenCalledOnce()
  })

  it('throws when the 2d context is unavailable, still freeing the bitmap', async () => {
    const bitmap = makeBitmap(800, 600)
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap))
    stubCanvas({ ctxNull: true })

    await expect(downscalePhoto(new Blob(['source']))).rejects.toThrow('canvas 2d context unavailable')
    expect(bitmap.close).toHaveBeenCalledOnce()
  })

  it('rejects when the browser cannot decode the file', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new Error('decode failed')
      }),
    )
    await expect(downscalePhoto(new Blob(['not an image']))).rejects.toThrow('decode failed')
  })
})
