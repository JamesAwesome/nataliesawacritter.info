import { describe, expect, it } from 'vitest'
import { UUID_RE, rejectUnknownFields } from './httpValidation.js'

describe('httpValidation', () => {
  it('UUID_RE accepts canonical uuids and rejects near-misses', () => {
    expect(UUID_RE.test('3f9a26cc-1c0e-4c3a-9b52-08a1c2f4d9aa')).toBe(true)
    expect(UUID_RE.test('3F9A26CC-1C0E-4C3A-9B52-08A1C2F4D9AA')).toBe(true)
    expect(UUID_RE.test('42')).toBe(false)
    expect(UUID_RE.test('3f9a26cc-1c0e-4c3a-9b52-08a1c2f4d9aa/../x')).toBe(false)
  })

  it('rejectUnknownFields marks every unknown key', () => {
    const details = Object.create(null) as Record<string, string>
    rejectUnknownFields({ emoji: '🦊', nickname: 'Foxy' }, new Set(['emoji']), details)
    expect(details).toEqual({ nickname: 'unknown field' })
  })
})
