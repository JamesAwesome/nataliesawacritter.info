import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { stripJpegExif } from './stripJpeg.js'

/** A real, decodable 16×16 JPEG carrying an EXIF tag (stands in for GPS). */
async function jpegWithExif(): Promise<Buffer> {
  return sharp({ create: { width: 16, height: 16, channels: 3, background: { r: 200, g: 40, b: 40 } } })
    .withExif({ IFD0: { Copyright: 'SECRET-GPS-40.7128' } })
    .jpeg()
    .toBuffer()
}

describe('stripJpegExif', () => {
  it('re-encodes to a valid JPEG with all metadata removed', async () => {
    const input = await jpegWithExif()
    expect((await sharp(input).metadata()).exif).toBeDefined() // sanity: input carries EXIF
    const out = await stripJpegExif(input)
    const meta = await sharp(out).metadata()
    expect(meta.format).toBe('jpeg') // still a decodable JPEG
    expect(meta.exif).toBeUndefined() // metadata stripped
    expect(out.includes(Buffer.from('SECRET-GPS-40.7128'))).toBe(false)
  })

  it('rejects a non-image body (fail-closed)', async () => {
    await expect(stripJpegExif(Buffer.from('this is not an image'))).rejects.toThrow()
    await expect(stripJpegExif(Buffer.from([0x00, 0x01, 0x02]))).rejects.toThrow()
  })
})
