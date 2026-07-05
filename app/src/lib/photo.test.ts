import { describe, expect, it } from 'vitest'
import { fitWithin } from './photo'

describe('fitWithin', () => {
  it('scales the long edge down to maxEdge proportionally', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 })
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 })
    expect(fitWithin(2000, 2000, 1600)).toEqual({ width: 1600, height: 1600 })
  })

  it('never upscales', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 })
  })

  it('rounds to integers with a 1px floor', () => {
    expect(fitWithin(3001, 100, 1600)).toEqual({ width: 1600, height: 53 })
    expect(fitWithin(10000, 1, 1600)).toEqual({ width: 1600, height: 1 })
  })
})
