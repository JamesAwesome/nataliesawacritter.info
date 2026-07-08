import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CUSTOM, CUSTOM_PREFIX, customFor, standInFor, tokenFor } from './customEmoji'

describe('customEmoji catalogue', () => {
  it('round-trips slug ↔ token and resolves known tokens', () => {
    expect(tokenFor('robin')).toBe('custom:robin')
    expect(customFor('custom:robin')?.name).toBe('Robin')
    expect(customFor('robin')).toBeNull() // bare slug is not a token
    expect(customFor('🦊')).toBeNull()
    expect(customFor('custom:unknown')).toBeNull()
  })

  it('standInFor maps known tokens to the stand-in and passes emoji through', () => {
    expect(standInFor('custom:robin')).toBe('🐦')
    expect(standInFor('🦊')).toBe('🦊')
    expect(standInFor('custom:unknown')).toBe('🐦') // fallback for an unknown custom token
  })

  it('every catalogue slug has an on-disk SVG (drift guard)', () => {
    const dir = join(process.cwd(), 'public/custom-emoji')
    const files = new Set(readdirSync(dir))
    for (const c of CUSTOM) expect(files.has(`${c.slug}.svg`)).toBe(true)
  })

  it('slugs are lowercase and the prefix is stable', () => {
    expect(CUSTOM_PREFIX).toBe('custom:')
    for (const c of CUSTOM) expect(c.slug).toMatch(/^[a-z-]+$/)
  })

  // Pinned slug list — the server test (Task 2) pins the SAME list, so adding a
  // bird to one side without the other fails a test (client↔server drift guard).
  it('exposes exactly the shipped slug set', () => {
    expect(CUSTOM.map((c) => c.slug)).toEqual([
      'robin', 'cardinal', 'blue-jay', 'chickadee', 'goldfinch', 'sparrow', 'seagull',
      'groundhog', 'opossum', 'bobcat', 'loon', 'puffin', 'grouse', 'firefly',
      'gritty', 'phanatic', 'anteater', 'red-panda', 'meerkat', 'lemur', 'aardvark', 'crane',
    ])
  })

  it('every catalogue entry has one of the five category keys', () => {
    const keys = new Set(['birds', 'mammals', 'reptiles', 'sea', 'bugs'])
    for (const c of CUSTOM) expect(keys.has(c.category)).toBe(true)
  })
})
