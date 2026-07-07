/** Remove ALL APP1 segments (EXIF/XMP/GPS) from a JPEG, copying every other
 *  segment and all entropy/scan data through unchanged, across concatenated
 *  (MPO/multi-image) streams. Fail-closed: throws on any malformed structure
 *  rather than passing bytes through unstripped. Defense-in-depth backstop —
 *  the client already re-encodes via canvas. */
export function stripJpegExif(buf: Buffer): Buffer {
  if (buf.length < 2 || buf[0] !== 0xff || buf[1] !== 0xd8) {
    throw new Error('not a JPEG')
  }
  const parts: Buffer[] = []
  let i = 0
  while (i + 1 < buf.length) {
    if (buf[i] !== 0xff) throw new Error('malformed JPEG: expected a marker')
    let m = i + 1
    while (m < buf.length && buf[m] === 0xff) m++ // skip fill bytes
    if (m >= buf.length) throw new Error('malformed JPEG: truncated marker')
    const marker = buf[m]
    // Standalone markers (no length payload): SOI, EOI, RSTn.
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(buf.subarray(i, m + 1))
      i = m + 1
      continue
    }
    if (marker === 0xda) {
      // SOS: header (length-prefixed) then entropy data up to the next real marker.
      if (m + 3 > buf.length) throw new Error('malformed JPEG: truncated SOS')
      const len = buf.readUInt16BE(m + 1)
      let p = m + 1 + len
      if (len < 2 || p > buf.length) throw new Error('malformed JPEG: bad SOS length')
      while (p + 1 < buf.length) {
        if (buf[p] === 0xff) {
          const next = buf[p + 1]
          if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) { p += 2; continue } // stuffing / RST
          break // real marker begins at p
        }
        p++
      }
      parts.push(buf.subarray(i, p))
      i = p
      continue
    }
    // Length-prefixed segment (APPn, DQT, DHT, SOFn, COM, ...).
    if (m + 3 > buf.length) throw new Error('malformed JPEG: truncated length')
    const len = buf.readUInt16BE(m + 1)
    const end = m + 1 + len
    if (len < 2 || end > buf.length) throw new Error('malformed JPEG: bad segment length')
    if (marker !== 0xe1) parts.push(buf.subarray(i, end)) // keep everything but APP1
    i = end
  }
  return Buffer.concat(parts)
}
