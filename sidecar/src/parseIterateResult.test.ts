import { describe, expect, it } from 'vitest'
import { parseIterateResult } from './parseIterateResult'

describe('parseIterateResult', () => {
  it('reads updated', () => {
    expect(parseIterateResult('did the thing\nRESULT: updated')).toEqual({ kind: 'updated' })
  })

  it('reads refused with the reason', () => {
    expect(parseIterateResult('RESULT: refused wants a copyrighted logo')).toEqual({
      kind: 'refused',
      reason: 'wants a copyrighted logo',
    })
  })

  it('refused without a reason still parses', () => {
    expect(parseIterateResult('RESULT: refused')).toEqual({ kind: 'refused', reason: 'no reason given' })
  })

  it('uses the last RESULT line', () => {
    expect(parseIterateResult('RESULT: refused early\nchanged my mind\nRESULT: updated')).toEqual({ kind: 'updated' })
  })

  it('errors when there is no RESULT line', () => {
    expect(parseIterateResult('i talked a lot but never concluded')).toEqual({
      kind: 'error',
      message: 'no RESULT line in agent output',
    })
  })
})
