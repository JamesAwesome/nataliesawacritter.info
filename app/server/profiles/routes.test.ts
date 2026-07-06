import express, { type Express, type RequestHandler } from 'express'
import { describe, expect, it, vi } from 'vitest'
import { requireWriteAuth } from '../auth.js'
import { errorHandler } from '../errorHandler.js'
import { basic, withServer } from '../testUtils.js'
import { profilesRouter } from './routes.js'
import type { Profile, ProfilesStore } from './store.js'

const FIXED_ID = '3f9a26cc-1c0e-4c3a-9b52-08a1c2f4d9aa'

function rowFor(fields: { emoji: string; name: string; place: string | null }): Profile {
  return { ...fields, id: FIXED_ID, createdAt: new Date('2026-07-04T12:00:00Z') }
}

function fakeStore(overrides: Partial<ProfilesStore> = {}): ProfilesStore {
  return {
    list: vi.fn(async () => []),
    create: vi.fn(async (fields) => ({ ok: true as const, row: rowFor(fields) })),
    remove: vi.fn(async () => true),
    ...overrides,
  }
}

const passGate: RequestHandler = (_req, _res, next) => next()

function appWith(store: ProfilesStore, gate: RequestHandler = passGate): Express {
  const app = express()
  app.use(express.json())
  app.use('/api/profiles', profilesRouter(store, gate))
  app.use(errorHandler)
  return app
}

async function post(base: string, body: unknown) {
  return fetch(`${base}/api/profiles`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('GET /api/profiles', () => {
  it('returns the list publicly', async () => {
    const store = fakeStore({
      list: vi.fn(async () => [rowFor({ emoji: '🦊', name: 'Mr Fox', place: 'train station' })]),
    })
    await withServer(appWith(store, requireWriteAuth('natalie', 'sekrit')), async (base) => {
      const res = await fetch(`${base}/api/profiles`)
      expect(res.status).toBe(200)
      const body = (await res.json()) as Array<{ name: string }>
      expect(body[0].name).toBe('Mr Fox')
    })
  })
})

describe('POST /api/profiles', () => {
  it('201s a valid profile', async () => {
    const store = fakeStore()
    await withServer(appWith(store), async (base) => {
      const res = await post(base, { emoji: '🦊', name: 'Mr Fox', place: 'train station' })
      expect(res.status).toBe(201)
      expect(store.create).toHaveBeenCalledWith({ emoji: '🦊', name: 'Mr Fox', place: 'train station' })
    })
  })

  it('normalizes empty place to null and omits are allowed', async () => {
    const store = fakeStore()
    await withServer(appWith(store), async (base) => {
      const res = await post(base, { emoji: '🦊', name: 'Mr Fox', place: '' })
      expect(res.status).toBe(201)
      expect(store.create).toHaveBeenCalledWith({ emoji: '🦊', name: 'Mr Fox', place: null })
    })
  })

  it('trims name and place before storing (friend identity keys on name)', async () => {
    const store = fakeStore()
    await withServer(appWith(store), async (base) => {
      const res = await post(base, { emoji: '🦊', name: '  Mr Fox  ', place: ' train station ' })
      expect(res.status).toBe(201)
      expect(store.create).toHaveBeenCalledWith({ emoji: '🦊', name: 'Mr Fox', place: 'train station' })
    })
  })

  it('rejects a whitespace-only name as missing', async () => {
    const store = fakeStore()
    await withServer(appWith(store), async (base) => {
      const res = await post(base, { emoji: '🦊', name: '   ' })
      expect(res.status).toBe(400)
      expect(((await res.json()) as { details: Record<string, string> }).details.name).toBeDefined()
      expect(store.create).not.toHaveBeenCalled()
    })
  })

  it.each([
    ['missing name', { emoji: '🦊' }, 'name'],
    ['empty name', { emoji: '🦊', name: '' }, 'name'],
    ['name too long', { emoji: '🦊', name: 'x'.repeat(101) }, 'name'],
    ['missing emoji', { name: 'Mr Fox' }, 'emoji'],
    ['emoji too long', { emoji: 'x'.repeat(41), name: 'Mr Fox' }, 'emoji'],
    ['place too long', { emoji: '🦊', name: 'Mr Fox', place: 'x'.repeat(101) }, 'place'],
    ['unknown field', { emoji: '🦊', name: 'Mr Fox', nickname: 'Foxy' }, 'nickname'],
  ])('400s on %s', async (_label, body, field) => {
    const store = fakeStore()
    await withServer(appWith(store), async (base) => {
      const res = await post(base, body)
      expect(res.status).toBe(400)
      expect(((await res.json()) as { details: Record<string, string> }).details[field]).toBeDefined()
      expect(store.create).not.toHaveBeenCalled()
    })
  })

  it('accepts a known custom emoji token and rejects an unknown one', async () => {
    const store = fakeStore()
    await withServer(appWith(store), async (base) => {
      const ok = await post(base, { emoji: 'custom:robin', name: 'Robin' })
      expect(ok.status).toBe(201)

      const bad = await post(base, { emoji: 'custom:nope', name: 'Robin' })
      expect(bad.status).toBe(400)
      expect(((await bad.json()) as { details: Record<string, string> }).details.emoji).toBeDefined()
    })
  })

  it('maps a store conflict to 409', async () => {
    const store = fakeStore({ create: vi.fn(async () => ({ ok: false as const, conflict: true as const })) })
    await withServer(appWith(store), async (base) => {
      const res = await post(base, { emoji: '🦊', name: 'Mr Fox' })
      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({ error: 'conflict' })
    })
  })

  it('is auth-gated', async () => {
    await withServer(appWith(fakeStore(), requireWriteAuth('natalie', 'sekrit')), async (base) => {
      expect((await post(base, { emoji: '🦊', name: 'Mr Fox' })).status).toBe(401)
    })
  })
})

describe('DELETE /api/profiles/:id', () => {
  it('204s on success, 404 on miss, 400 on non-uuid, and is auth-gated', async () => {
    const store = fakeStore()
    await withServer(appWith(store), async (base) => {
      expect((await fetch(`${base}/api/profiles/${FIXED_ID}`, { method: 'DELETE' })).status).toBe(204)
    })
    await withServer(appWith(fakeStore({ remove: vi.fn(async () => false) })), async (base) => {
      expect((await fetch(`${base}/api/profiles/${FIXED_ID}`, { method: 'DELETE' })).status).toBe(404)
    })
    await withServer(appWith(store), async (base) => {
      expect((await fetch(`${base}/api/profiles/42`, { method: 'DELETE' })).status).toBe(400)
    })
    await withServer(appWith(store, requireWriteAuth('natalie', 'sekrit')), async (base) => {
      expect(
        (await fetch(`${base}/api/profiles/${FIXED_ID}`, {
          method: 'DELETE',
          headers: { authorization: basic('natalie', 'wrong') },
        })).status,
      ).toBe(401)
    })
  })
})
