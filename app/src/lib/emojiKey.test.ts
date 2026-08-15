import { describe, expect, it } from 'vitest'
import { emojiKey } from './emojiKey'

describe('emojiKey', () => {
  it('drops the variation selector so both forms of an emoji key alike', () => {
    expect(emojiKey('🕊️')).toBe(emojiKey('🕊'))
    expect(emojiKey('🐿️')).toBe(emojiKey('🐿'))
  })

  it('leaves everything else alone, including ZWJ sequences and custom tokens', () => {
    expect(emojiKey('🦊')).toBe('🦊')
    expect(emojiKey('🐦‍⬛')).toBe('🐦‍⬛')
    expect(emojiKey('custom:crow')).toBe('custom:crow')
  })

  it('keeps distinct emoji distinct', () => {
    expect(emojiKey('🕊️')).not.toBe(emojiKey('🦅'))
  })
})
