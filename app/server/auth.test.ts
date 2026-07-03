import express from 'express'
import { describe, expect, it } from 'vitest'
import { requireWriteAuth } from './auth.js'
import { basic, withServer } from './testUtils.js'

function appWithAuth() {
  const app = express()
  app.post('/api/protected', requireWriteAuth('natalie', 'sekrit'), (_req, res) => {
    res.json({ ok: true })
  })
  return app
}

describe('requireWriteAuth', () => {
  it('rejects requests with no credentials with 401 + WWW-Authenticate', async () => {
    await withServer(appWithAuth(), async (base) => {
      const res = await fetch(`${base}/api/protected`, { method: 'POST' })
      expect(res.status).toBe(401)
      expect(res.headers.get('www-authenticate')).toContain('Basic')
    })
  })

  it('rejects wrong password', async () => {
    await withServer(appWithAuth(), async (base) => {
      const res = await fetch(`${base}/api/protected`, {
        method: 'POST',
        headers: { authorization: basic('natalie', 'wrong') },
      })
      expect(res.status).toBe(401)
    })
  })

  it('rejects wrong user', async () => {
    await withServer(appWithAuth(), async (base) => {
      const res = await fetch(`${base}/api/protected`, {
        method: 'POST',
        headers: { authorization: basic('mallory', 'sekrit') },
      })
      expect(res.status).toBe(401)
    })
  })

  it('rejects malformed authorization header', async () => {
    await withServer(appWithAuth(), async (base) => {
      const res = await fetch(`${base}/api/protected`, {
        method: 'POST',
        headers: { authorization: 'Bearer nope' },
      })
      expect(res.status).toBe(401)
    })
  })

  it('accepts correct credentials', async () => {
    await withServer(appWithAuth(), async (base) => {
      const res = await fetch(`${base}/api/protected`, {
        method: 'POST',
        headers: { authorization: basic('natalie', 'sekrit') },
      })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true })
    })
  })

  it('rejects a Basic header whose payload has no colon', async () => {
    await withServer(appWithAuth(), async (base) => {
      const res = await fetch(`${base}/api/protected`, {
        method: 'POST',
        headers: { authorization: 'Basic ' + Buffer.from('nataliesekrit').toString('base64') },
      })
      expect(res.status).toBe(401)
    })
  })

  it('throws when constructed with an empty user', () => {
    expect(() => requireWriteAuth('', 'sekrit')).toThrow(/non-empty/)
  })

  it('throws when constructed with an empty password', () => {
    expect(() => requireWriteAuth('natalie', '')).toThrow(/non-empty/)
  })
})
