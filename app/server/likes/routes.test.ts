import express, { type Express } from 'express'
import { describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../errorHandler.js'
import { withServer } from '../testUtils.js'
import type { LikesStore } from './store.js'
import { likesRouter } from './routes.js'

const SID = '3f9a26cc-1c0e-4c3a-9b52-08a1c2f4d9aa'
const DEV = '11111111-1111-4111-8111-111111111111'

function fakeLikes(overrides: Partial<LikesStore> = {}): LikesStore {
  return { like: vi.fn(async () => {}), unlike: vi.fn(async () => {}), countFor: vi.fn(async () => 3), ...overrides }
}
const sightingExists = { getById: vi.fn(async () => ({ id: SID })) } as never
const sightingMissing = { getById: vi.fn(async () => null) } as never
const noLimit: express.RequestHandler = (_q, _s, next) => next()

function appWith(likes: LikesStore, sightings = sightingExists): Express {
  const app = express()
  app.use('/api/sightings', likesRouter(likes, sightings, noLimit))
  app.use(errorHandler)
  return app
}
const hit = (base: string, method: 'POST' | 'DELETE', id = SID, dev: string | null = DEV) =>
  fetch(`${base}/api/sightings/${id}/like`, { method, headers: dev === null ? {} : { 'X-Device-Id': dev } })

describe('like routes', () => {
  it('POST likes idempotently and returns the count (public: no auth header sent)', async () => {
    const likes = fakeLikes()
    await withServer(appWith(likes), async (base) => {
      const res = await hit(base, 'POST')
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ likeCount: 3 })
      expect(likes.like).toHaveBeenCalledWith(SID, DEV)
    })
  })

  it('DELETE unlikes and returns the count', async () => {
    const likes = fakeLikes()
    await withServer(appWith(likes), async (base) => {
      const res = await hit(base, 'DELETE')
      expect(res.status).toBe(200)
      expect(likes.unlike).toHaveBeenCalledWith(SID, DEV)
    })
  })

  it.each([
    ['bad sighting id', 'not-a-uuid', DEV],
    ['missing X-Device-Id', SID, null],
    ['bad X-Device-Id', SID, 'garbage'],
  ])('400s on %s without touching the store', async (_l, id, dev) => {
    const likes = fakeLikes()
    await withServer(appWith(likes), async (base) => {
      expect((await hit(base, 'POST', id as string, dev as string | null)).status).toBe(400)
      expect(likes.like).not.toHaveBeenCalled()
    })
  })

  it('404s an unknown sighting', async () => {
    await withServer(appWith(fakeLikes(), sightingMissing), async (base) => {
      expect((await hit(base, 'POST')).status).toBe(404)
    })
  })
})
