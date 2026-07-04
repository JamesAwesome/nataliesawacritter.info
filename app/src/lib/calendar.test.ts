import { describe, expect, it } from 'vitest'
import { makeSighting } from '../test/helpers'
import { addMonths, monthGrid, monthLabel } from './calendar'

describe('monthGrid', () => {
  it('returns 42 cells starting on the Sunday on or before the 1st', () => {
    // July 2026: the 1st is a Wednesday → grid starts Sun Jun 28
    const cells = monthGrid(2026, 7, [], '2026-07-03')
    expect(cells).toHaveLength(42)
    expect(cells[0]).toMatchObject({ date: '2026-06-28', inMonth: false, dayOfMonth: 28 })
    expect(cells[3]).toMatchObject({ date: '2026-07-01', inMonth: true, dayOfMonth: 1 })
    expect(cells[33]).toMatchObject({ date: '2026-07-31', inMonth: true })
    expect(cells[34]).toMatchObject({ date: '2026-08-01', inMonth: false })
  })

  it('marks today only when it falls in the grid', () => {
    const cells = monthGrid(2026, 7, [], '2026-07-03')
    expect(cells.filter((c) => c.isToday).map((c) => c.date)).toEqual(['2026-07-03'])
    expect(monthGrid(2026, 9, [], '2026-07-03').some((c) => c.isToday)).toBe(false)
  })

  it('handles leap February', () => {
    const cells = monthGrid(2028, 2, [], '2026-07-03')
    expect(cells.some((c) => c.date === '2028-02-29' && c.inMonth)).toBe(true)
    expect(cells.some((c) => c.date === '2028-02-30')).toBe(false)
  })

  it('handles a grid straddling a year boundary', () => {
    // Dec 2026: 1st is a Tuesday → starts Sun Nov 29; ends in Jan 2027
    const cells = monthGrid(2026, 12, [], '2026-07-03')
    expect(cells[0].date).toBe('2026-11-29')
    expect(cells[41].date).toBe('2027-01-09')
  })

  it('groups sightings onto their day preserving input order', () => {
    const a = makeSighting({ sightedOn: '2026-07-02', name: 'newer' })
    const b = makeSighting({ sightedOn: '2026-07-02', name: 'older' })
    const c = makeSighting({ sightedOn: '2026-07-04', name: 'solo' })
    const cells = monthGrid(2026, 7, [a, b, c], '2026-07-03')
    const day2 = cells.find((x) => x.date === '2026-07-02')!
    expect(day2.sightings.map((s) => s.name)).toEqual(['newer', 'older'])
    expect(cells.find((x) => x.date === '2026-07-04')!.sightings).toHaveLength(1)
    expect(cells.find((x) => x.date === '2026-07-05')!.sightings).toHaveLength(0)
  })

  it('only marks today when the cell is in-month (not a bleed day)', () => {
    // today = 2026-08-01; viewing July 2026, whose trailing cells include Aug 1
    const cells = monthGrid(2026, 7, [], '2026-08-01')
    const bleed = cells.find((c) => c.date === '2026-08-01')!
    expect(bleed.inMonth).toBe(false)
    expect(bleed.isToday).toBe(false)
    // and an in-month today is still flagged
    expect(monthGrid(2026, 8, [], '2026-08-01').find((c) => c.date === '2026-08-01')!.isToday).toBe(true)
  })
})

describe('monthLabel / addMonths', () => {
  it('formats the label', () => {
    expect(monthLabel(2026, 7)).toBe('July 2026')
    expect(monthLabel(2027, 1)).toBe('January 2027')
  })

  it('wraps across year boundaries', () => {
    expect(addMonths(2026, 12, 1)).toEqual({ year: 2027, month: 1 })
    expect(addMonths(2026, 1, -1)).toEqual({ year: 2025, month: 12 })
    expect(addMonths(2026, 6, 1)).toEqual({ year: 2026, month: 7 })
  })
})
