import { describe, expect, it } from 'vitest'
import { CURATED, EXTENDED } from './critters'
import { CUSTOM, customFor, tokenFor } from './customEmoji'
import { CATEGORIES } from './emojiCategories'

describe('emoji categories', () => {
  const allItems = CATEGORIES.flatMap((c) => c.items)

  it('covers every curated and extended emoji exactly once (drift guard)', () => {
    // Non-custom items must be precisely CURATED ∪ EXTENDED — nothing missing,
    // nothing extra, no duplicates. Adding to EXTENDED without categorizing fails here.
    const nonCustom = allItems.filter((e) => customFor(e) === null)
    const expected = [...CURATED.map((c) => c.emoji), ...EXTENDED]
    expect([...nonCustom].sort()).toEqual([...expected].sort())
  })

  it('includes every custom bird in the Birds category, with no duplicates anywhere', () => {
    const birds = CATEGORIES.find((c) => c.key === 'birds')
    expect(birds).toBeDefined()
    for (const c of CUSTOM) expect(birds?.items).toContain(tokenFor(c.slug))
    expect(new Set(allItems).size).toBe(allItems.length)
  })

  it('exposes the five broad groups in order', () => {
    expect(CATEGORIES.map((c) => c.label)).toEqual([
      'Birds', 'Mammals', 'Reptiles & Amphibians', 'Sea Life', 'Bugs',
    ])
  })
})
