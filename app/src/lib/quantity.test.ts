import { describe, expect, it } from 'vitest'
import { QUANTITIES, isQuantity, quantityLabel } from './quantity'

describe('quantity', () => {
  it('offers exactly 1, 2, 3, many in order', () => {
    expect(QUANTITIES).toEqual(['1', '2', '3', 'many'])
  })

  it('labels: 1 is blank (no badge), 2/3 are ×N', () => {
    expect(quantityLabel('1', '🦊')).toBe('')
    expect(quantityLabel('2', '🦊')).toBe('×2')
    expect(quantityLabel('3', '🦊')).toBe('×3')
  })

  it('many is the critter’s collective noun, capitalised', () => {
    expect(quantityLabel('many', 'custom:crow')).toBe('Murder')
    expect(quantityLabel('many', '🐇')).toBe('Fluffle')
    expect(quantityLabel('many', 'custom:meerkat')).toBe('Mob')
  })

  it('many falls back to Many for a critter with no collective noun', () => {
    expect(quantityLabel('many', 'custom:phanatic')).toBe('Many')
  })

  it('isQuantity accepts only the four tokens', () => {
    expect(isQuantity('1')).toBe(true)
    expect(isQuantity('2')).toBe(true)
    expect(isQuantity('3')).toBe(true)
    expect(isQuantity('many')).toBe(true)
    expect(isQuantity('4')).toBe(false)
    expect(isQuantity('')).toBe(false)
    expect(isQuantity(2)).toBe(false)
    expect(isQuantity(null)).toBe(false)
  })
})
