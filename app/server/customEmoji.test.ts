import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { KNOWN_SLUGS, isKnownCustom, standInFor } from './customEmoji.js'

describe('server customEmoji', () => {
  it('standInFor maps known tokens and passes emoji through', () => {
    expect(standInFor('custom:cardinal')).toBe('🐦')
    expect(standInFor('🦊')).toBe('🦊')
    expect(standInFor('custom:unknown')).toBe('🐦')
  })

  it('isKnownCustom accepts known tokens, rejects unknown and non-custom', () => {
    expect(isKnownCustom('custom:robin')).toBe(true)
    expect(isKnownCustom('custom:unknown')).toBe(false)
    expect(isKnownCustom('🦊')).toBe(false)
  })

  it('known slugs match the on-disk SVG files exactly (drift guard, both ways)', () => {
    const dir = join(process.cwd(), 'public/custom-emoji')
    const svgs = readdirSync(dir).filter((f) => f.endsWith('.svg'))
    const files = new Set(svgs)
    for (const slug of KNOWN_SLUGS) expect(files.has(`${slug}.svg`)).toBe(true)
    // …and no orphan SVG without a catalogue entry.
    expect(svgs.length).toBe(KNOWN_SLUGS.size)
  })

  // Same pinned list as the client catalogue test — keeps the two catalogues in
  // sync so a client-only bird can't be picked-yet-rejected by the server.
  it('knows exactly the shipped slug set', () => {
    expect([...KNOWN_SLUGS].sort()).toEqual(
      [
        'blue-jay', 'cardinal', 'chickadee', 'goldfinch', 'robin', 'sparrow', 'seagull',
        'groundhog', 'opossum', 'bobcat', 'loon', 'puffin', 'grouse', 'firefly',
        'gritty', 'phanatic', 'anteater', 'red-panda', 'meerkat', 'lemur', 'aardvark', 'crane', 'canada-goose', 'pigeon',
        'highland-cow',
      ].sort(),
    )
  })
})
