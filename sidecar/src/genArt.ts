const DEFAULT_MODEL = 'gemini-2.5-flash-image'

/** Flat-house-style prompt. The animal is sanitized (single line, length-capped)
 *  — the pre-screen + vision check are the real copyright guards; this is
 *  defense-in-depth. */
export function buildEmojiPrompt(animal: string): string {
  const a = animal.replace(/\s+/g, ' ').trim().slice(0, 60)
  return `A flat vector emoji sticker of a ${a}, front-facing face, centered, bold simple shapes, minimal shading, no outline, no border, limited flat color palette, friendly and cute. Plain solid mint-green (#7bd88f) background filling the frame. No text, no watermark, no signature. Must be an original design that does not resemble any existing cartoon character, mascot, brand, or logo.`
}

/** Calls the Gemini image model and writes the PNG. Throws on HTTP error or a
 *  response with no image (safety block / text-only) so the caller can retry.
 *  `fetch`/`writeFile` injected for testability. Verify the request/response
 *  shape against current Gemini API docs. */
export async function generateEmojiArt(opts: {
  animal: string
  outPath: string
  apiKey: string
  model?: string
  fetch: typeof globalThis.fetch
  writeFile: (path: string, data: Uint8Array) => Promise<void>
}): Promise<void> {
  const model = opts.model ?? DEFAULT_MODEL
  const res = await opts.fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': opts.apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: buildEmojiPrompt(opts.animal) }] }] }),
  })
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string } }> } }>
  }
  const b64 = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data
  if (!b64) throw new Error('gemini returned no image (safety block or text-only response)')
  await opts.writeFile(opts.outPath, Buffer.from(b64, 'base64'))
}
