import { writeFile } from 'node:fs/promises'
import { generateEmojiArt } from '../genArt'

// subject = a short description INCLUDING composition, e.g. "a full-body pelican,
// side view" or "a red panda's face" — the caller (skill) picks face vs full body.
const [subject, outPath] = process.argv.slice(2)
const apiKey = process.env.GEMINI_API_KEY
if (!subject || !outPath) {
  console.error('usage: gen-emoji-art "<subject incl. composition>" <outPath>')
  process.exit(2)
}
if (!apiKey) {
  console.error('gen-emoji-art: GEMINI_API_KEY not set — caller should hand-draw instead')
  process.exit(3)
}
try {
  await generateEmojiArt({ subject, outPath, apiKey, fetch: globalThis.fetch, writeFile })
  console.log(`wrote ${outPath}`)
} catch (err) {
  console.error(`gen-emoji-art: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}
