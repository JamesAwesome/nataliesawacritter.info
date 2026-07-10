import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Names of critters already in the catalogue, scraped from the repo's client
 *  sources (custom emoji + curated), for dedupe. Best-effort — a missing file
 *  just contributes nothing. */
export function existingNames(repoDir: string): string[] {
  const files = [join(repoDir, 'app/src/lib/customEmoji.ts'), join(repoDir, 'app/src/lib/critters.ts')]
  const names = new Set<string>()
  for (const file of files) {
    let src: string
    try {
      src = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    for (const m of src.matchAll(/name:\s*'([^']+)'/g)) names.add(m[1]!)
  }
  return [...names]
}
