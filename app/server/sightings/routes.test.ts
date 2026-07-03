import express, { type ErrorRequestHandler, type Express, type RequestHandler } from 'express'
import { describe, expect, it, vi } from 'vitest'
import { requireWriteAuth } from '../auth.js'
import { withServer } from '../testUtils.js'
import { sightingsRouter } from './routes.js'
import type { Sighting, SightingsStore } from './store.js'

const FIXED_ID = '3f9a26cc-1c0e-4c3a-9b52-08a1c2f4d9aa'

// The fetch types ship `Response.json(): Promise<unknown>`; these narrow the
// shapes this suite actually asserts on so tests avoid `any`.
type SightingJson = Omit<Sighting, 'createdAt'> & { createdAt: string }
type ValidationEnvelope = { error: 'validation'; details: Record<string, string> }

function rowFor(fields: Parameters<SightingsStore['create']>[0]): Sighting {
  return { ...fields, id: FIXED_ID, photoPath: null, createdAt: new Date('2026-07-03T12:00:00Z') }
}

function fakeStore(overrides: Partial<SightingsStore> = {}): SightingsStore {
  return {
    list: vi.fn(async () => []),
    create: vi.fn(async (fields) => rowFor(fields)),
    remove: vi.fn(async () => true),
    ...overrides,
  }
}

const passGate: RequestHandler = (_req, _res, next) => next()

function appWith(store: SightingsStore, gate: RequestHandler = passGate): Express {
  const app = express()
  app.use(express.json())
  app.use('/api/sightings', sightingsRouter(store, gate))
  // mirror the app-level error middleware so rejected handlers 500 in tests too
  app.use(((_err, _req, res, _next) => {
    res.status(500).json({ error: 'internal' })
  }) as ErrorRequestHandler)
  return app
}

const VALID = { emoji: '🦊', sightedOn: '2026-07-03' }

describe('GET /api/sightings', () => {
  it('returns the store list as JSON with ISO createdAt', async () => {
    const store = fakeStore({ list: vi.fn(async () => [rowFor({ ...VALID, name: 'Fox', sightedTime: null, place: null, comment: null })]) })
    await withServer(appWith(store), async (base) => {
      const res = await fetch(`${base}/api/sightings`)
      expect(res.status).toBe(200)
      const body = (await res.json()) as SightingJson[]
      expect(body).toHaveLength(1)
      expect(body[0].id).toBe(FIXED_ID)
      expect(body[0].createdAt).toBe('2026-07-03T12:00:00.000Z')
      expect(store.list).toHaveBeenCalledWith({ from: undefined, to: undefined })
    })
  })

  it('passes from/to through to the store', async () => {
    const store = fakeStore()
    await withServer(appWith(store), async (base) => {
      const res = await fetch(`${base}/api/sightings?from=2026-07-01&to=2026-07-31`)
      expect(res.status).toBe(200)
      expect(store.list).toHaveBeenCalledWith({ from: '2026-07-01', to: '2026-07-31' })
    })
  })

  it.each([
    ['bad from', '?from=07/01/2026', 'from'],
    ['bad to', '?to=2026-13-01', 'to'],
    ['impossible date', '?from=2026-02-30', 'from'],
  ])('400s on %s', async (_label, query, field) => {
    await withServer(appWith(fakeStore()), async (base) => {
      const res = await fetch(`${base}/api/sightings${query}`)
      expect(res.status).toBe(400)
      const body = (await res.json()) as ValidationEnvelope
      expect(body.error).toBe('validation')
      expect(body.details[field]).toBe('must be YYYY-MM-DD')
    })
  })

  it('400s when from > to', async () => {
    await withServer(appWith(fakeStore()), async (base) => {
      const res = await fetch(`${base}/api/sightings?from=2026-07-31&to=2026-07-01`)
      expect(res.status).toBe(400)
      expect(((await res.json()) as ValidationEnvelope).details.from).toBe('must be on or before to')
    })
  })
})

describe('POST /api/sightings', () => {
  async function post(base: string, body: unknown) {
    return fetch(`${base}/api/sightings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  it('201s a valid full body and echoes the created row', async () => {
    const store = fakeStore()
    await withServer(appWith(store), async (base) => {
      const res = await post(base, { ...VALID, name: 'Fox', sightedTime: 'dusk', place: 'trail', comment: 'so fluffy' })
      expect(res.status).toBe(201)
      expect(((await res.json()) as SightingJson).id).toBe(FIXED_ID)
      expect(store.create).toHaveBeenCalledWith({
        emoji: '🦊', sightedOn: '2026-07-03', name: 'Fox', sightedTime: 'dusk', place: 'trail', comment: 'so fluffy',
      })
    })
  })

  it('normalizes omitted, null, and empty-string optionals to null', async () => {
    const store = fakeStore()
    await withServer(appWith(store), async (base) => {
      const res = await post(base, { ...VALID, name: '', sightedTime: null })
      expect(res.status).toBe(201)
      expect(store.create).toHaveBeenCalledWith({
        emoji: '🦊', sightedOn: '2026-07-03', name: null, sightedTime: null, place: null, comment: null,
      })
    })
  })

  it.each([
    ['missing emoji', { sightedOn: '2026-07-03' }, 'emoji'],
    ['empty emoji', { ...VALID, emoji: '' }, 'emoji'],
    ['emoji too long', { ...VALID, emoji: 'x'.repeat(17) }, 'emoji'],
    ['emoji wrong type', { ...VALID, emoji: 7 }, 'emoji'],
    ['missing sightedOn', { emoji: '🦊' }, 'sightedOn'],
    ['bad sightedOn format', { ...VALID, sightedOn: '07/03/2026' }, 'sightedOn'],
    ['impossible sightedOn', { ...VALID, sightedOn: '2026-02-30' }, 'sightedOn'],
    ['name too long', { ...VALID, name: 'x'.repeat(101) }, 'name'],
    ['name wrong type', { ...VALID, name: 42 }, 'name'],
    ['comment too long', { ...VALID, comment: 'x'.repeat(1001) }, 'comment'],
    ['unknown field photoPath', { ...VALID, photoPath: '/x.jpg' }, 'photoPath'],
    ['unknown field id', { ...VALID, id: FIXED_ID }, 'id'],
  ])('400s on %s', async (_label, body, field) => {
    const store = fakeStore()
    await withServer(appWith(store), async (base) => {
      const res = await post(base, body)
      expect(res.status).toBe(400)
      const parsed = (await res.json()) as ValidationEnvelope
      expect(parsed.error).toBe('validation')
      expect(parsed.details[field]).toBeDefined()
      expect(store.create).not.toHaveBeenCalled()
    })
  })

  it('aggregates multiple field errors in one response', async () => {
    await withServer(appWith(fakeStore()), async (base) => {
      const res = await post(base, { emoji: '', sightedOn: 'nope', extra: 1 })
      expect(res.status).toBe(400)
      const { details } = (await res.json()) as ValidationEnvelope
      expect(Object.keys(details).sort()).toEqual(['emoji', 'extra', 'sightedOn'])
    })
  })

  it('400s a non-object body', async () => {
    await withServer(appWith(fakeStore()), async (base) => {
      const res = await post(base, ['🦊'])
      expect(res.status).toBe(400)
    })
  })

  it('400s a body with a __proto__ field', async () => {
    const store = fakeStore()
    await withServer(appWith(store), async (base) => {
      const res = await fetch(`${base}/api/sightings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"emoji":"🦊","sightedOn":"2026-07-03","__proto__":{"x":1}}',
      })
      expect(res.status).toBe(400)
      const parsed = (await res.json()) as ValidationEnvelope
      expect(parsed.details.__proto__).toBe('unknown field')
      expect(store.create).not.toHaveBeenCalled()
    })
  })

  it('500s with a sanitized envelope when the store rejects', async () => {
    const store = fakeStore({ create: vi.fn(async () => { throw new Error('db down') }) })
    await withServer(appWith(store), async (base) => {
      const res = await post(base, VALID)
      expect(res.status).toBe(500)
      expect(await res.json()).toEqual({ error: 'internal' })
    })
  })
})

describe('DELETE /api/sightings/:id', () => {
  it('204s when the store removes the row', async () => {
    const store = fakeStore()
    await withServer(appWith(store), async (base) => {
      const res = await fetch(`${base}/api/sightings/${FIXED_ID}`, { method: 'DELETE' })
      expect(res.status).toBe(204)
      expect(store.remove).toHaveBeenCalledWith(FIXED_ID)
    })
  })

  it('404s when the store finds nothing', async () => {
    const store = fakeStore({ remove: vi.fn(async () => false) })
    await withServer(appWith(store), async (base) => {
      const res = await fetch(`${base}/api/sightings/${FIXED_ID}`, { method: 'DELETE' })
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ error: 'not found' })
    })
  })

  it('400s a non-uuid id without touching the store', async () => {
    const store = fakeStore()
    await withServer(appWith(store), async (base) => {
      const res = await fetch(`${base}/api/sightings/42`, { method: 'DELETE' })
      expect(res.status).toBe(400)
      expect(((await res.json()) as ValidationEnvelope).details.id).toBe('must be a uuid')
      expect(store.remove).not.toHaveBeenCalled()
    })
  })
})

describe('write gate', () => {
  const gated = () => appWith(fakeStore(), requireWriteAuth('natalie', 'sekrit'))
  const auth = 'Basic ' + Buffer.from('natalie:sekrit').toString('base64')

  it('GET is public even with a gate', async () => {
    await withServer(gated(), async (base) => {
      expect((await fetch(`${base}/api/sightings`)).status).toBe(200)
    })
  })

  it('POST and DELETE 401 without credentials', async () => {
    await withServer(gated(), async (base) => {
      const post = await fetch(`${base}/api/sightings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(VALID),
      })
      const del = await fetch(`${base}/api/sightings/${FIXED_ID}`, { method: 'DELETE' })
      expect(post.status).toBe(401)
      expect(del.status).toBe(401)
    })
  })

  it('POST succeeds with credentials', async () => {
    await withServer(gated(), async (base) => {
      const res = await fetch(`${base}/api/sightings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: auth },
        body: JSON.stringify(VALID),
      })
      expect(res.status).toBe(201)
    })
  })
})
