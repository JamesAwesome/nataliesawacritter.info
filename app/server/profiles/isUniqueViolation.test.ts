import { describe, expect, it } from 'vitest'
import { isUniqueViolation } from './store.js'

describe('isUniqueViolation', () => {
  it('finds 23505 through wrapped causes', () => {
    expect(isUniqueViolation({ cause: { cause: { code: '23505' } } })).toBe(true)
    expect(isUniqueViolation({ code: '42P01' })).toBe(false)
  })

  it('terminates on a cyclic cause chain', () => {
    const cyclic: { code: string; cause?: unknown } = { code: '42P01' }
    cyclic.cause = cyclic
    expect(isUniqueViolation(cyclic)).toBe(false)
  })
})
