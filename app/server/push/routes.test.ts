import express, { type Express } from 'express'
import { describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../errorHandler.js'
import { withServer } from '../testUtils.js'
import { pushRouter } from './routes.js'
import type { PushStore } from './store.js'

const PUBLIC_KEY = 'test-public-key'
const VALID = { endpoint: 'https://push.example.com/send/abc', keys: { p256dh: 'pk', auth: 'ak' } }

function fakeStore(overrides: Partial<PushStore> = {}): PushStore {
  return {
    upsert: vi.fn(async () => {}),
    removeByEndpoint: vi.fn(async () => true),
    listAll: vi.fn(async () => []),
    ...overrides,
  }
}

function appWith(store: PushStore, key: string | null = PUBLIC_KEY): Express {
  const app = express()
  app.use(express.json())
  app.use('/api/push', pushRouter(store, key))
  app.use(errorHandler)
  return app
}

async function send(base: string, method: 'POST' | 'DELETE', body: unknown) {
  return fetch(`${base}/api/push/subscriptions`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('GET /api/push/vapid-public-key', () => {
  it('returns the key', async () => {
    await withServer(appWith(fakeStore()), async (base) => {
      const res = await fetch(`${base}/api/push/vapid-public-key`)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ key: PUBLIC_KEY })
    })
  })
})

describe('POST /api/push/subscriptions', () => {
  it('201s and upserts a valid subscription', async () => {
    const store = fakeStore()
    await withServer(appWith(store), async (base) => {
      const res = await send(base, 'POST', VALID)
      expect(res.status).toBe(201)
      expect(await res.json()).toEqual({ ok: true })
      expect(store.upsert).toHaveBeenCalledWith({ endpoint: VALID.endpoint, p256dh: 'pk', auth: 'ak' })
    })
  })

  it.each([
    ['missing endpoint', { keys: VALID.keys }, 'endpoint'],
    ['non-url endpoint', { ...VALID, endpoint: 'not a url' }, 'endpoint'],
    ['http endpoint', { ...VALID, endpoint: 'http://push.example.com/x' }, 'endpoint'],
    ['endpoint too long', { ...VALID, endpoint: 'https://push.example.com/' + 'x'.repeat(1001) }, 'endpoint'],
    ['missing keys', { endpoint: VALID.endpoint }, 'keys'],
    ['keys not an object', { ...VALID, keys: 'nope' }, 'keys'],
    ['empty p256dh', { ...VALID, keys: { p256dh: '', auth: 'ak' } }, 'keys.p256dh'],
    ['missing auth', { ...VALID, keys: { p256dh: 'pk' } }, 'keys.auth'],
    ['auth too long', { ...VALID, keys: { p256dh: 'pk', auth: 'x'.repeat(201) } }, 'keys.auth'],
    ['unknown top-level field', { ...VALID, expirationTime: null }, 'expirationTime'],
    ['unknown key field', { ...VALID, keys: { ...VALID.keys, extra: 'x' } }, 'keys.extra'],
  ])('400s on %s', async (_label, body, field) => {
    const store = fakeStore()
    await withServer(appWith(store), async (base) => {
      const res = await send(base, 'POST', body)
      expect(res.status).toBe(400)
      expect(((await res.json()) as { details: Record<string, string> }).details[field]).toBeDefined()
      expect(store.upsert).not.toHaveBeenCalled()
    })
  })
})

describe('DELETE /api/push/subscriptions', () => {
  it('204s whether or not the row existed, and 400s without an endpoint', async () => {
    const store = fakeStore()
    await withServer(appWith(store), async (base) => {
      expect((await send(base, 'DELETE', { endpoint: VALID.endpoint })).status).toBe(204)
      expect(store.removeByEndpoint).toHaveBeenCalledWith(VALID.endpoint)
    })
    await withServer(appWith(fakeStore({ removeByEndpoint: vi.fn(async () => false) })), async (base) => {
      expect((await send(base, 'DELETE', { endpoint: VALID.endpoint })).status).toBe(204)
    })
    await withServer(appWith(fakeStore()), async (base) => {
      expect((await send(base, 'DELETE', {})).status).toBe(400)
    })
  })
})

describe('when push is unconfigured', () => {
  it('503s every route with the push-disabled envelope', async () => {
    const store = fakeStore()
    await withServer(appWith(store, null), async (base) => {
      for (const res of [
        await fetch(`${base}/api/push/vapid-public-key`),
        await send(base, 'POST', VALID),
        await send(base, 'DELETE', { endpoint: VALID.endpoint }),
      ]) {
        expect(res.status).toBe(503)
        expect(await res.json()).toEqual({ error: 'push disabled' })
      }
      expect(store.upsert).not.toHaveBeenCalled()
      expect(store.removeByEndpoint).not.toHaveBeenCalled()
    })
  })
})
