const MAX_EDGE = 1600
const JPEG_QUALITY = 0.85

/** Proportional downscale so max(width,height) ≤ maxEdge. Never upscales. */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/** Re-encode a picked image to a bounded JPEG. ALWAYS re-encodes, even when
 *  already small — the re-encode is what strips EXIF/GPS before upload.
 *  Rejects when the browser cannot decode the file. */
export async function downscalePhoto(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_EDGE)
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')
    if (ctx === null) throw new Error('canvas 2d context unavailable')
    ctx.drawImage(bitmap, 0, 0, width, height)
    return await canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY })
  } finally {
    bitmap.close()
  }
}
