import { afterEach, describe, expect, it } from 'vitest'
import { basicHeader, clearCredentials, getCredentials, setCredentials } from './auth'

afterEach(() => {
  localStorage.clear()
})

describe('credential storage', () => {
  it('returns null when nothing is stored', () => {
    expect(getCredentials()).toBeNull()
  })

  it('stores and retrieves credentials with user natalie', () => {
    setCredentials('sekrit')
    expect(getCredentials()).toEqual({ user: 'natalie', password: 'sekrit' })
  })

  it('clears credentials', () => {
    setCredentials('sekrit')
    clearCredentials()
    expect(getCredentials()).toBeNull()
  })

  it('survives corrupt stored JSON by returning null', () => {
    localStorage.setItem('critter-write-auth', '{nope')
    expect(getCredentials()).toBeNull()
  })

  it('builds the Basic header', () => {
    expect(basicHeader({ user: 'natalie', password: 'sekrit' })).toBe(
      'Basic ' + btoa('natalie:sekrit'),
    )
  })

  it('encodes non-Latin1 passwords as UTF-8 without throwing', () => {
    const creds = { user: 'natalie', password: 'sꙮ🦊pass' }
    let header = ''
    expect(() => {
      header = basicHeader(creds)
    }).not.toThrow()
    const b64 = header.replace('Basic ', '')
    const decoded = new TextDecoder().decode(
      Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)),
    )
    expect(decoded).toBe(`${creds.user}:${creds.password}`)
  })
})
