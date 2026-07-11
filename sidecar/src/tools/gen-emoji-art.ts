import { writeFile } from 'node:fs/promises'
import { generateEmojiArt } from '../genArt'

const [animal, outPath] = process.argv.slice(2)
const apiKey = process.env.GEMINI_API_KEY
if (!animal || !outPath) {
  console.error('usage: gen-emoji-art "<animal>" <outPath>')
  process.exit(2)
}
if (!apiKey) {
  console.error('gen-emoji-art: GEMINI_API_KEY not set — caller should hand-draw instead')
  process.exit(3)
}
try {
  await generateEmojiArt({ animal, outPath, apiKey, fetch: globalThis.fetch, writeFile })
  console.log(`wrote ${outPath}`)
} catch (err) {
  console.error(`gen-emoji-art: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}
