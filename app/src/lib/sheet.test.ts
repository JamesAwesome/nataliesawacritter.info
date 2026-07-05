import { describe, expect, it } from 'vitest'
import { makeSighting } from '../test/helpers'
import { sheetIsValid } from './sheet'

const ROW = makeSighting()

describe('sheetIsValid', () => {
  it('accepts null, log, and day sheets regardless of data', () => {
    expect(sheetIsValid(null, [])).toBe(true)
    expect(sheetIsValid({ kind: 'log' }, [])).toBe(true)
    expect(sheetIsValid({ kind: 'day', date: '2026-07-01' }, [])).toBe(true)
  })

  it('accepts a sighting sheet whose id resolves', () => {
    expect(sheetIsValid({ kind: 'sighting', id: ROW.id }, [ROW])).toBe(true)
  })

  it('rejects a sighting sheet whose id is gone', () => {
    expect(sheetIsValid({ kind: 'sighting', id: ROW.id }, [])).toBe(false)
  })
})
