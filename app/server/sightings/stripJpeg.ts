/** Remove all APP1 segments (EXIF + XMP — where GPS/location metadata lives) from
 *  a JPEG, copying every other segment (and the scan data) through unchanged.
 *  Throws if the buffer is not a JPEG. Defense-in-depth: the client already
 *  re-encodes via canvas, which strips EXIF; this backstops non-SPA uploads. */
export function stripJpegExif(buf: Buffer): Buffer {
  if (buf.length < 2 || buf[0] !== 0xff || buf[1] !== 0xd8) {
    throw new Error('not a JPEG')
  }
  const parts: Buffer[] = [buf.subarray(0, 2)] // SOI
  let i = 2
  while (i + 1 < buf.length) {
    if (buf[i] !== 0xff) {
      parts.push(buf.subarray(i)) // not marker-aligned; copy remainder verbatim
      return Buffer.concat(parts)
    }
    const marker = buf[i + 1]
    if (marker === 0xd9 || marker === 0xda) {
      // EOI, or SOS (scan data follows to EOI) — copy this + everything after.
      parts.push(buf.subarray(i))
      return Buffer.concat(parts)
    }
    if (marker >= 0xd0 && marker <= 0xd7) {
      parts.push(buf.subarray(i, i + 2)) // RSTn: standalone, no length
      i += 2
      continue
    }
    const len = buf.readUInt16BE(i + 2)
    const end = i + 2 + len
    if (end > buf.length) throw new Error('malformed JPEG segment')
    if (marker !== 0xe1) parts.push(buf.subarray(i, end)) // keep all but APP1
    i = end
  }
  return Buffer.concat(parts)
}
