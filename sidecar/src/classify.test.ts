import { describe, expect, it } from 'vitest'
import { outcomeOf } from './classify'

describe('outcomeOf', () => {
  it('maps agent results to DB outcomes', () => {
    expect(outcomeOf({ kind: 'pr-opened', prUrl: 'https://x/pull/1' })).toEqual({
      outcome: 'pr-opened',
      prUrl: 'https://x/pull/1',
    })
    expect(outcomeOf({ kind: 'skipped-copyright' })).toEqual({ outcome: 'skipped-copyright', prUrl: null })
    expect(outcomeOf({ kind: 'skipped-unclear' })).toEqual({ outcome: 'skipped-unclear', prUrl: null })
  })

  it('returns null on error (leave unhandled for retry)', () => {
    expect(outcomeOf({ kind: 'error', message: 'boom' })).toBeNull()
  })
})
