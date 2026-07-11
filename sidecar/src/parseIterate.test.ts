import { describe, expect, it } from 'vitest'
import { parseIterate } from './parseIterate'

describe('parseIterate', () => {
  it('extracts the feedback after the /iterate token', () => {
    expect(parseIterate('/iterate make the beak bigger')).toBe('make the beak bigger')
  })

  it('trims surrounding whitespace and leading blank lines', () => {
    expect(parseIterate('  \n/iterate   round the corners  \n')).toBe('round the corners')
  })

  it('captures multi-line feedback', () => {
    expect(parseIterate('/iterate line one\nline two')).toBe('line one\nline two')
  })

  it('is case-insensitive on the command token', () => {
    expect(parseIterate('/ITERATE brighten it')).toBe('brighten it')
  })

  it('returns null for casual chatter', () => {
    expect(parseIterate('lgtm')).toBeNull()
    expect(parseIterate('nice, but please /iterate later')).toBeNull()
  })

  it('returns null when /iterate has no feedback', () => {
    expect(parseIterate('/iterate')).toBeNull()
    expect(parseIterate('/iterate   ')).toBeNull()
  })

  it('requires /iterate to be its own token (not a prefix of a word)', () => {
    expect(parseIterate('/iteratefoo bar')).toBeNull()
  })
})
