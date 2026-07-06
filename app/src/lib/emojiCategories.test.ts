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

  it('places every custom token in exactly its declared category', () => {
    for (const c of CUSTOM) {
      const inCat = CATEGORIES.find((cat) => cat.key === c.category)
      expect(inCat, `category ${c.category} exists`).toBeDefined()
      expect(inCat?.items).toContain(tokenFor(c.slug))
      // and in no other category
      const others = CATEGORIES.filter((cat) => cat.key !== c.category)
      for (const o of others) expect(o.items).not.toContain(tokenFor(c.slug))
    }
  })

  it('every custom emoji declares a known category', () => {
    const keys = new Set(CATEGORIES.map((c) => c.key))
    for (const c of CUSTOM) expect(keys.has(c.category)).toBe(true)
  })

  it('includes the moose in the Mammals category', () => {
    const mammals = CATEGORIES.find((c) => c.key === 'mammals')
    expect(mammals?.items).toContain('🫎')
  })
})
