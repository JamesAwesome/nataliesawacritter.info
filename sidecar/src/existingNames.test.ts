import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { existingNames } from './existingNames'

describe('existingNames', () => {
  it('scrapes critter names from the repo (custom + curated)', () => {
    const repoRoot = resolve(import.meta.dirname, '../..')
    const names = existingNames(repoRoot)
    expect(names).toContain('Deer') // curated
    expect(names).toContain('Pigeon') // custom
    expect(names.length).toBeGreaterThan(15)
  })

  it('returns [] when the source files are absent', () => {
    expect(existingNames('/nonexistent-xyz-123')).toEqual([])
  })
})
