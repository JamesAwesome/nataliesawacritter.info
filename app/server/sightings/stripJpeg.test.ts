import { describe, expect, it } from 'vitest'
import { stripJpegExif } from './stripJpeg.js'

// Minimal JPEG parts: SOI, an APP1/EXIF segment carrying fake GPS bytes, an
// APP0/JFIF, an SOS with tiny scan data, EOI.
function seg(marker: number, payload: Buffer): Buffer {
  const len = Buffer.alloc(2)
  len.writeUInt16BE(payload.length + 2, 0)
  return Buffer.concat([Buffer.from([0xff, marker]), len, payload])
}
const SOI = Buffer.from([0xff, 0xd8])
const EOI = Buffer.from([0xff, 0xd9])
const sos = Buffer.concat([seg(0xda, Buffer.from([0x00, 0x01])), Buffer.from([0x12, 0x34])])
const image = (gps: string) =>
  Buffer.concat([
    SOI,
    seg(0xe1, Buffer.concat([Buffer.from('Exif\0\0'), Buffer.from(gps)])), // EXIF APP1 w/ GPS
    seg(0xe0, Buffer.from('JFIF\0')),
    sos,
    EOI,
  ])

describe('stripJpegExif', () => {
  it('removes EXIF/GPS (APP1) and returns a still-valid JPEG', async () => {
    const input = image('GPSLAT-40.7128')
    const out = await stripJpegExif(input)
    expect(out.subarray(0, 2)).toEqual(SOI) // still a JPEG
    expect(out.includes(Buffer.from('GPSLAT'))).toBe(false) // GPS gone
    expect(out.includes(Buffer.from([0xff, 0xe1]))).toBe(false) // APP1 marker gone
    expect(out.includes(Buffer.from('JFIF'))).toBe(true) // non-metadata segment kept
    expect(out.length).toBeLessThan(input.length)
  })

  it('strips EXIF/GPS from every image in a concatenated (MPO) JPEG', async () => {
    const out = await stripJpegExif(Buffer.concat([image('GPS-IMAGE-ONE'), image('GPS-IMAGE-TWO')]))
    expect(out.includes(Buffer.from('GPS-IMAGE-ONE'))).toBe(false)
    expect(out.includes(Buffer.from('GPS-IMAGE-TWO'))).toBe(false) // second image also stripped
    expect(out.includes(Buffer.from([0xff, 0xe1]))).toBe(false)
  })

  it('rejects (throws) a non-JPEG body — fail-closed', async () => {
    await expect(stripJpegExif(Buffer.from('this is not a jpeg'))).rejects.toThrow()
    await expect(stripJpegExif(Buffer.from([0x00, 0x01, 0x02]))).rejects.toThrow()
  })
})
