import sharp from 'sharp'

/** Re-encode a JPEG via sharp, which strips ALL metadata by default (EXIF/GPS,
 *  XMP, IPTC, COM, ICC) and fully decodes the bytes — so it also validates the
 *  upload is a real image and throws on anything malformed or non-image
 *  (photoRoutes turns that into a 400). `limitInputPixels` rejects
 *  decompression-bomb dimensions; `failOn: 'error'` rejects truncated/corrupt
 *  input. Defense-in-depth backstop behind the client's canvas re-encode. */
export async function stripJpegExif(buf: Buffer): Promise<Buffer> {
  return sharp(buf, { limitInputPixels: 25_000_000, failOn: 'error' })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer()
}
