import { describe, expect, it } from 'vitest'
import { redact } from './redact'

describe('redact', () => {
  it('masks credentials embedded in a git/gh remote url', () => {
    expect(redact('fatal: unable to access https://x-access-token:ghp_secret@github.com/o/r')).toBe(
      'fatal: unable to access https://***@github.com/o/r',
    )
  })

  it('masks basic user:pass@ too', () => {
    expect(redact('https://natalie:sekrit@app:8080/api')).toBe('https://***@app:8080/api')
  })

  it('leaves secret-free text untouched', () => {
    expect(redact('reconciled 1 merged')).toBe('reconciled 1 merged')
  })
})
