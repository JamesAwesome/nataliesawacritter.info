import { describe, expect, it } from 'vitest'
import { formatDay, formatWhen } from './format'

describe('formatDay', () => {
  it('formats date without time', () => {
    expect(formatDay('2026-12-25')).toBe('Dec 25')
  })
})

describe('formatWhen', () => {
  it('formats date and free-text time', () => {
    expect(formatWhen('2026-07-03', 'dusk')).toBe('Jul 3 · dusk')
  })

  it('uses "just now" when time is null', () => {
    expect(formatWhen('2026-12-25', null)).toBe('Dec 25 · just now')
  })

  it('is not shifted by timezone (parses as local date)', () => {
    expect(formatWhen('2026-01-01', null)).toBe('Jan 1 · just now')
  })
})
