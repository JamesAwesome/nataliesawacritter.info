import { describe, expect, it } from 'vitest'
import { stripJpegExif } from './stripJpeg.js'

// Minimal JPEG: SOI, an APP1/EXIF segment carrying fake GPS bytes, a DQT-ish
// APP0, an SOS with tiny scan data, EOI.
function seg(marker: number, payload: Buffer): Buffer {
  const len = Buffer.alloc(2)
  len.writeUInt16BE(payload.length + 2, 0)
  return Buffer.concat([Buffer.from([0xff, marker]), len, payload])
}
const SOI = Buffer.from([0xff, 0xd8])
const EOI = Buffer.from([0xff, 0xd9])
const app1 = seg(0xe1, Buffer.concat([Buffer.from('Exif\0\0'), Buffer.from('GPSLAT-40.7128')]))
const app0 = seg(0xe0, Buffer.from('JFIF\0'))
const sos = Buffer.concat([seg(0xda, Buffer.from([0x00, 0x01])), Buffer.from([0x12, 0x34])]) // header + scan bytes

describe('stripJpegExif', () => {
  it('removes APP1 (EXIF/GPS) while keeping the rest of the JPEG', () => {
    const input = Buffer.concat([SOI, app1, app0, sos, EOI])
    const out = stripJpegExif(input)
    expect(out.subarray(0, 2)).toEqual(SOI) // still a JPEG
    expect(out.includes(Buffer.from('GPSLAT'))).toBe(false) // GPS gone
    expect(out.includes(Buffer.from('JFIF'))).toBe(true) // APP0 preserved
    expect(out.includes(Buffer.from([0xff, 0xe1]))).toBe(false) // no APP1 marker
    expect(out.length).toBeLessThan(input.length)
  })

  it('throws on non-JPEG bytes', () => {
    expect(() => stripJpegExif(Buffer.from('this is not a jpeg'))).toThrow()
  })
})
