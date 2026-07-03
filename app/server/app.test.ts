import { describe, expect, it } from 'vitest'
import { createApp } from './app.js'
import { withServer } from './testUtils.js'

describe('GET /api/health', () => {
  it('returns 200 {ok, db: true} when the db responds', async () => {
    const app = createApp({ checkDb: async () => {} })
    await withServer(app, async (base) => {
      const res = await fetch(`${base}/api/health`)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true, db: true })
    })
  })

  it('returns 503 {ok: false, db: false} when the db check throws', async () => {
    const app = createApp({
      checkDb: async () => {
        throw new Error('connection refused')
      },
    })
    await withServer(app, async (base) => {
      const res = await fetch(`${base}/api/health`)
      expect(res.status).toBe(503)
      expect(await res.json()).toEqual({ ok: false, db: false })
    })
  })

  it('returns JSON 404 for unknown /api routes', async () => {
    const app = createApp({ checkDb: async () => {} })
    await withServer(app, async (base) => {
      const res = await fetch(`${base}/api/nope`)
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ error: 'not found' })
    })
  })
})
