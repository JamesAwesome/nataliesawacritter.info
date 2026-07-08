import { describe, expect, it } from 'vitest'
import { QUANTITIES, isQuantity, quantityTextSuffix } from './quantity.js'

describe('server quantity', () => {
  it('allows exactly 1, 2, 3, many (matches the client picker)', () => {
    expect(QUANTITIES).toEqual(['1', '2', '3', 'many'])
  })

  it('text suffix: blank for 1, " ×N" for 2/3, " · Many" for many', () => {
    expect(quantityTextSuffix('1')).toBe('')
    expect(quantityTextSuffix('2')).toBe(' ×2')
    expect(quantityTextSuffix('3')).toBe(' ×3')
    expect(quantityTextSuffix('many')).toBe(' · Many')
  })

  it('isQuantity accepts only the four tokens', () => {
    expect(isQuantity('1')).toBe(true)
    expect(isQuantity('many')).toBe(true)
    expect(isQuantity('4')).toBe(false)
    expect(isQuantity('')).toBe(false)
    expect(isQuantity(2)).toBe(false)
  })
})
