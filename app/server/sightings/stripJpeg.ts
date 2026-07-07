import { Readable } from 'node:stream'
import ExifTransformer from 'exif-be-gone'

/** Strip EXIF/GPS/XMP metadata from a JPEG using exif-be-gone (a maintained,
 *  zero-dependency stream stripper that also handles multi-image/MPO files —
 *  where phone GPS actually lives). Fail-closed on non-JPEG input via an SOI
 *  magic-byte check, so a non-image body is rejected (→ 400) rather than passed
 *  through. Defense-in-depth backstop: the client already re-encodes via canvas.
 *
 *  Note: exif-be-gone targets EXIF/XMP (APP1). IPTC (APP13) / COM are not
 *  stripped — an accepted low residual, since phone cameras write location to
 *  EXIF, not IPTC. */
export async function stripJpegExif(buf: Buffer): Promise<Buffer> {
  if (buf.length < 2 || buf[0] !== 0xff || buf[1] !== 0xd8) {
    throw new Error('not a JPEG')
  }
  const chunks: Buffer[] = []
  const transformer = new ExifTransformer()
  Readable.from(buf).pipe(transformer)
  for await (const chunk of transformer) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}
