import { describe, expect, it } from 'vitest'
import { parseResult } from './parseResult'

describe('parseResult', () => {
  it('parses pr-opened with a url', () => {
    expect(parseResult('done!\nRESULT: pr-opened https://github.com/o/r/pull/7')).toEqual({
      kind: 'pr-opened',
      prUrl: 'https://github.com/o/r/pull/7',
    })
  })

  it('parses the two skip outcomes', () => {
    expect(parseResult('RESULT: skipped-copyright')).toEqual({ kind: 'skipped-copyright' })
    expect(parseResult('RESULT: skipped-unclear')).toEqual({ kind: 'skipped-unclear' })
  })

  it('treats pr-opened without a valid url as an error', () => {
    expect(parseResult('RESULT: pr-opened').kind).toBe('error')
    expect(parseResult('RESULT: pr-opened not-a-url').kind).toBe('error')
  })

  it('errors when there is no RESULT line', () => {
    expect(parseResult('I made a nice emoji').kind).toBe('error')
  })

  it('uses the last RESULT line when several appear', () => {
    expect(parseResult('RESULT: skipped-unclear\n...\nRESULT: pr-opened https://x/pull/1')).toEqual({
      kind: 'pr-opened',
      prUrl: 'https://x/pull/1',
    })
  })
})
