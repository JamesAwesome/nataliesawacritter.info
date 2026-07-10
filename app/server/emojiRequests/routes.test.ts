import express, { type Express, type RequestHandler } from 'express'
import { describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../errorHandler.js'
import { withServer } from '../testUtils.js'
import { emojiRequestsRouter } from './routes.js'
import type { EmojiRequest, EmojiRequestsStore } from './store.js'

const FIXED_ID = '3f9a26cc-1c0e-4c3a-9b52-08a1c2f4d9aa'
type Json = Omit<EmojiRequest, 'createdAt'> & { createdAt: string }
type ValidationEnvelope = { error: 'validation'; details: Record<string, string> }

function rowFor(fields: Parameters<EmojiRequestsStore['create']>[0]): EmojiRequest {
  return { ...fields, id: FIXED_ID, createdAt: new Date('2026-07-10T12:00:00.000Z') }
}

function fakeStore(overrides: Partial<EmojiRequestsStore> = {}): EmojiRequestsStore {
  return {
    list: vi.fn(async () => []),
    create: vi.fn(async (fields) => rowFor(fields)),
    remove: vi.fn(async () => true),
    ...overrides,
  }
}

const passGate: RequestHandler = (_req, _res, next) => next()
const denyGate: RequestHandler = (_req, res) => {
  res.status(401).json({ error: 'unauthorized' })
}

function appWith(
  store: EmojiRequestsStore,
  gate: RequestHandler = passGate,
  onCreated: (r: EmojiRequest) => void = () => {},
): Express {
  const app = express()
  app.use(express.json())
  app.use('/api/emoji-requests', emojiRequestsRouter(store, gate, onCreated))
  app.use(errorHandler)
  return app
}

async function post(base: string, body: unknown) {
  return fetch(`${base}/api/emoji-requests`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/emoji-requests', () => {
  it('201s a valid request and echoes the created row', async () => {
    const store = fakeStore()
    await withServer(appWith(store), async (base) => {
      const res = await post(base, { name: 'Pigeon', note: 'the city kind' })
      expect(res.status).toBe(201)
      expect(((await res.json()) as Json).id).toBe(FIXED_ID)
      expect(store.create).toHaveBeenCalledWith({ name: 'Pigeon', note: 'the city kind' })
    })
  })

  it('calls onCreated with the new request (for the ntfy alert)', async () => {
    const store = fakeStore()
    const onCreated = vi.fn()
    await withServer(appWith(store, passGate, onCreated), async (base) => {
      await post(base, { name: 'Pigeon' })
      expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: FIXED_ID, name: 'Pigeon' }))
    })
  })

  it('trims the name and normalizes a blank/absent note to null', async () => {
    const store = fakeStore()
    await withServer(appWith(store), async (base) => {
      const res = await post(base, { name: '  Pigeon  ', note: '' })
      expect(res.status).toBe(201)
      expect(store.create).toHaveBeenCalledWith({ name: 'Pigeon', note: null })
    })
  })

  it.each([
    ['missing name', {}, 'name'],
    ['blank name', { name: '   ' }, 'name'],
    ['name too long', { name: 'x'.repeat(81) }, 'name'],
    ['name wrong type', { name: 7 }, 'name'],
    ['note too long', { name: 'Pigeon', note: 'x'.repeat(501) }, 'note'],
    ['unknown field', { name: 'Pigeon', emoji: '🐦' }, 'emoji'],
  ])('400s on %s', async (_label, body, field) => {
    await withServer(appWith(fakeStore()), async (base) => {
      const res = await post(base, body)
      expect(res.status).toBe(400)
      const parsed = (await res.json()) as ValidationEnvelope
      expect(parsed.error).toBe('validation')
      expect(parsed.details[field]).toBeDefined()
    })
  })

  it('is write-gated (401 when the gate rejects)', async () => {
    await withServer(appWith(fakeStore(), denyGate), async (base) => {
      expect((await post(base, { name: 'Pigeon' })).status).toBe(401)
    })
  })
})

describe('GET /api/emoji-requests', () => {
  it('returns the store list, newest first', async () => {
    const store = fakeStore({ list: vi.fn(async () => [rowFor({ name: 'Pigeon', note: null })]) })
    await withServer(appWith(store), async (base) => {
      const res = await fetch(`${base}/api/emoji-requests`)
      expect(res.status).toBe(200)
      expect(((await res.json()) as Json[])[0].name).toBe('Pigeon')
    })
  })

  it('is write-gated — owner-only, unlike public sighting reads', async () => {
    await withServer(appWith(fakeStore(), denyGate), async (base) => {
      expect((await fetch(`${base}/api/emoji-requests`)).status).toBe(401)
    })
  })
})

describe('DELETE /api/emoji-requests/:id', () => {
  it('204s and dismisses an existing request', async () => {
    const store = fakeStore()
    await withServer(appWith(store), async (base) => {
      const res = await fetch(`${base}/api/emoji-requests/${FIXED_ID}`, { method: 'DELETE' })
      expect(res.status).toBe(204)
      expect(store.remove).toHaveBeenCalledWith(FIXED_ID)
    })
  })

  it('404s a missing request', async () => {
    const store = fakeStore({ remove: vi.fn(async () => false) })
    await withServer(appWith(store), async (base) => {
      expect((await fetch(`${base}/api/emoji-requests/${FIXED_ID}`, { method: 'DELETE' })).status).toBe(404)
    })
  })

  it('400s a non-uuid id', async () => {
    await withServer(appWith(fakeStore()), async (base) => {
      expect((await fetch(`${base}/api/emoji-requests/nope`, { method: 'DELETE' })).status).toBe(400)
    })
  })
})
