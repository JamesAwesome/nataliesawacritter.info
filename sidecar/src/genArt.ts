const DEFAULT_MODEL = 'gemini-2.5-flash-image'

/** Flat-house-style prompt. `subject` is the caller's short description of what to
 *  draw INCLUDING the composition — e.g. "a full-body pelican, side view" or
 *  "a red panda's face" — so the agent picks full-body vs. face per critter (a
 *  horseshoe crab or pelican needs its whole body, not a face). Sanitized (single
 *  line, length-capped). The pre-screen + vision check are the real copyright
 *  guards; the originality clause here is defense-in-depth. */
export function buildEmojiPrompt(subject: string): string {
  const s = subject.replace(/\s+/g, ' ').trim().slice(0, 80)
  return `A flat vector emoji sticker of ${s}, centered and filling the frame, bold simple shapes, minimal shading, no outline, no border, limited flat color palette, clean and appealing. Depict the animal naturally: only show a face, eyes, or mouth if they are actually visible in the described view — do NOT add a cartoon smiley face, grin, or googly eyes to a body, shell, back, or top-down view (for example a horseshoe crab seen from above). Plain solid mint-green (#7bd88f) background filling the frame. No text, no watermark, no signature. Must be an original design that does not resemble any existing cartoon character, mascot, brand, or logo.`
}

/** Calls the Gemini image model and writes the PNG. Throws on HTTP error or a
 *  response with no image (safety block / text-only) so the caller can retry.
 *  `fetch`/`writeFile` injected for testability. Verify the request/response
 *  shape against current Gemini API docs. */
export async function generateEmojiArt(opts: {
  subject: string
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
    body: JSON.stringify({ contents: [{ parts: [{ text: buildEmojiPrompt(opts.subject) }] }] }),
  })
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string } }> } }>
  }
  const b64 = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data
  if (!b64) throw new Error('gemini returned no image (safety block or text-only response)')
  await opts.writeFile(opts.outPath, Buffer.from(b64, 'base64'))
}
