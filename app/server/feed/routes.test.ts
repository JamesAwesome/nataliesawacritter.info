import express, { type Express } from 'express'
import { describe, expect, it, vi } from 'vitest'
import type { Sighting, SightingsStore } from '../sightings/store.js'
import { withServer } from '../testUtils.js'
import { feedRouter } from './routes.js'

const SITE = 'https://example.test'

function row(overrides: Partial<Sighting> = {}): Sighting {
  return {
    id: '3f9a26cc-1c0e-4c3a-9b52-08a1c2f4d9aa',
    emoji: '🦊',
    name: 'Mr Fox',
    sightedOn: '2026-07-05',
    sightedTime: null,
    place: null,
    comment: null,
    photoPath: null,
    createdAt: new Date('2026-07-05T12:00:00Z'),
    ...overrides,
  }
}

function fakeStore(list: Sighting[]): SightingsStore {
  return {
    list: vi.fn(async () => list),
    create: vi.fn(async () => { throw new Error('unused') }),
    remove: vi.fn(async () => true),
    getById: vi.fn(async () => null),
    setPhotoPath: vi.fn(async () => null),
  }
}

function appWith(store: SightingsStore): Express {
  const app = express()
  app.use(feedRouter(store, SITE))
  return app
}

describe('GET /feed.xml', () => {
  it('serves RSS with the right content-type and cache header', async () => {
    await withServer(appWith(fakeStore([row()])), async (base) => {
      const res = await fetch(`${base}/feed.xml`)
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('application/rss+xml; charset=utf-8')
      expect(res.headers.get('cache-control')).toBe('public, max-age=300')
      const body = await res.text()
      expect(body).toContain('<rss version="2.0"')
      expect(body).toContain('🦊 Natalie saw Mr Fox')
    })
  })

  it('caps the feed at 50 items', async () => {
    const many = Array.from({ length: 60 }, (_, i) => row({ id: `id-${i}` }))
    const store = fakeStore(many)
    await withServer(appWith(store), async (base) => {
      const body = await (await fetch(`${base}/feed.xml`)).text()
      expect((body.match(/<item>/g) ?? []).length).toBe(50)
    })
  })
})
