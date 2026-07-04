import { describe, expect, it } from 'vitest'
import { formatDay, formatWhen } from './format'
import { useFakeClock } from '../test/helpers'
import { formatClockTime, nowClockTime } from './format'

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

describe('formatClockTime', () => {
  it('converts 24h HH:MM to a friendly 12-hour string', () => {
    expect(formatClockTime('14:30')).toBe('2:30 PM')
    expect(formatClockTime('00:05')).toBe('12:05 AM')
    expect(formatClockTime('12:00')).toBe('12:00 PM')
    expect(formatClockTime('09:07')).toBe('9:07 AM')
    expect(formatClockTime('23:59')).toBe('11:59 PM')
  })

  it('returns non-HH:MM input unchanged (defensive passthrough)', () => {
    expect(formatClockTime('dusk')).toBe('dusk')
    expect(formatClockTime('')).toBe('')
    expect(formatClockTime('25:00')).toBe('25:00')
  })
})

describe('nowClockTime', () => {
  useFakeClock() // fixed at 2026-07-03T15:00:00 local

  it('returns the current local time as HH:MM', () => {
    expect(nowClockTime()).toBe('15:00')
  })
})
