import { describe, expect, it, vi } from 'vitest'
import { createApp, type AppDeps } from './app.js'
import type { ProfilesStore } from './profiles/store.js'
import type { SightingsStore } from './sightings/store.js'
import { basic, fakePushStore, nullNotifier, withServer } from './testUtils.js'

function fakeStore(): SightingsStore {
  return {
    list: vi.fn(async () => []),
    create: vi.fn(async () => {
      throw new Error('unused')
    }),
    remove: vi.fn(async () => true),
    getById: vi.fn(async () => null),
    setPhotoPath: vi.fn(async () => null),
  }
}

function fakeProfilesStore(): ProfilesStore {
  return {
    list: vi.fn(async () => []),
    create: vi.fn(async () => {
      throw new Error('unused')
    }),
    remove: vi.fn(async () => true),
  }
}

function deps(overrides: Partial<AppDeps> = {}): AppDeps {
  return {
    checkDb: async () => {},
    sightingsStore: fakeStore(),
    profilesStore: fakeProfilesStore(),
    emojiRequestsStore: {
      list: vi.fn(async () => []),
      create: vi.fn(async (f) => ({ id: '0', name: f.name, note: f.note, createdAt: new Date(0) })),
      remove: vi.fn(async () => true),
    },
    writeCredentials: null,
    photosDir: '/tmp/unused-photos',
    pushStore: fakePushStore(),
    notifier: nullNotifier(),
    siteUrl: 'https://example.test',
    ...overrides,
  }
}

describe('GET /api/health', () => {
  it('returns 200 {ok, db: true} when the db responds', async () => {
    const app = createApp(deps())
    await withServer(app, async (base) => {
      const res = await fetch(`${base}/api/health`)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true, db: true })
    })
  })

  it('returns 503 {ok: false, db: false} when the db check throws', async () => {
    const app = createApp(deps({ checkDb: async () => { throw new Error('connection refused') } }))
    await withServer(app, async (base) => {
      const res = await fetch(`${base}/api/health`)
      expect(res.status).toBe(503)
      expect(await res.json()).toEqual({ ok: false, db: false })
    })
  })

  it('returns JSON 404 for unknown /api routes', async () => {
    const app = createApp(deps())
    await withServer(app, async (base) => {
      const res = await fetch(`${base}/api/nope`)
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ error: 'not found' })
    })
  })
})

describe('sightings wiring', () => {
  it('serves GET /api/sightings through the app', async () => {
    await withServer(createApp(deps()), async (base) => {
      const res = await fetch(`${base}/api/sightings`)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual([])
    })
  })

  it('returns 503 writes-disabled when credentials are absent', async () => {
    await withServer(createApp(deps()), async (base) => {
      const res = await fetch(`${base}/api/sightings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ emoji: '🦊', sightedOn: '2026-07-03' }),
      })
      expect(res.status).toBe(503)
      expect(await res.json()).toEqual({ error: 'writes disabled' })
    })
  })

  it('accepts authenticated writes when credentials are configured', async () => {
    const store = fakeStore()
    store.create = vi.fn(async (fields) => ({
      ...fields, id: '3f9a26cc-1c0e-4c3a-9b52-08a1c2f4d9aa', photoPath: null, createdAt: new Date(),
    }))
    const app = createApp(deps({ sightingsStore: store, writeCredentials: { user: 'natalie', password: 'sekrit' } }))
    await withServer(app, async (base) => {
      const res = await fetch(`${base}/api/sightings`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: basic('natalie', 'sekrit'),
        },
        body: JSON.stringify({ emoji: '🦊', sightedOn: '2026-07-03' }),
      })
      expect(res.status).toBe(201)
    })
  })

  it('returns a sanitized 500 when the store rejects', async () => {
    const store = fakeStore()
    store.list = vi.fn(async () => {
      throw new Error('db exploded')
    })
    await withServer(createApp(deps({ sightingsStore: store })), async (base) => {
      const res = await fetch(`${base}/api/sightings`)
      expect(res.status).toBe(500)
      expect(await res.json()).toEqual({ error: 'internal' })
    })
  })

  it('returns 400 for malformed JSON bodies', async () => {
    await withServer(createApp(deps()), async (base) => {
      const res = await fetch(`${base}/api/sightings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{not json',
      })
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'bad request' })
    })
  })
})

describe('GET /api/auth/check', () => {
  it('204s with valid credentials, 401s with wrong or missing', async () => {
    const app = createApp(deps({ writeCredentials: { user: 'natalie', password: 'sekrit' } }))
    await withServer(app, async (base) => {
      const ok = await fetch(`${base}/api/auth/check`, {
        headers: { authorization: basic('natalie', 'sekrit') },
      })
      expect(ok.status).toBe(204)
      const wrong = await fetch(`${base}/api/auth/check`, {
        headers: { authorization: basic('natalie', 'nope') },
      })
      expect(wrong.status).toBe(401)
      expect((await fetch(`${base}/api/auth/check`)).status).toBe(401)
    })
  })

  it('503s when writes are disabled', async () => {
    await withServer(createApp(deps()), async (base) => {
      const res = await fetch(`${base}/api/auth/check`)
      expect(res.status).toBe(503)
      expect(await res.json()).toEqual({ error: 'writes disabled' })
    })
  })
})

describe('security headers', () => {
  it('sets CSP, HSTS, referrer/permissions policies, nosniff, and no x-powered-by', async () => {
    await withServer(createApp(deps()), async (base) => {
      const res = await fetch(`${base}/api/health`)
      const csp = res.headers.get('content-security-policy') ?? ''
      expect(csp).toContain("default-src 'self'")
      expect(csp).toContain("frame-ancestors 'none'")
      expect(csp).toContain('https://fonts.gstatic.com')
      expect(res.headers.get('strict-transport-security')).toBeTruthy()
      expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
      expect(res.headers.get('permissions-policy') ?? '').toContain('geolocation=()')
      expect(res.headers.get('x-content-type-options')).toBe('nosniff')
      expect(res.headers.get('x-powered-by')).toBeNull()
    })
  })
})

describe('rate limiting', () => {
  it('429s mutations past the limit, keyed per client IP', async () => {
    const app = createApp(deps({ rateLimits: { authPerMin: 100, mutationPerMin: 2 } }))
    await withServer(app, async (base) => {
      const post = () =>
        fetch(`${base}/api/push/subscriptions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.9' },
          body: JSON.stringify({}),
        })
      const a = await post()
      const b = await post()
      const c = await post()
      expect(c.status).toBe(429) // third mutation from the same IP is limited
      expect(a.status).not.toBe(429)
      expect(b.status).not.toBe(429)
    })
  })

  it('does not rate-limit GET reads', async () => {
    const app = createApp(deps({ rateLimits: { authPerMin: 100, mutationPerMin: 2 } }))
    await withServer(app, async (base) => {
      for (let i = 0; i < 5; i++) expect((await fetch(`${base}/api/sightings`)).status).toBe(200)
    })
  })

  it('throttles credential brute-force via a write route at the tighter auth ceiling', async () => {
    // authPerMin low, mutationPerMin high: failed write-auth must hit the AUTH
    // limiter, not slip through at the looser mutation ceiling.
    const app = createApp(
      deps({
        writeCredentials: { user: 'natalie', password: 'sekrit' },
        rateLimits: { authPerMin: 2, mutationPerMin: 100 },
      }),
    )
    await withServer(app, async (base) => {
      const badAuth = () =>
        fetch(`${base}/api/sightings`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'cf-connecting-ip': '203.0.113.55',
            authorization: basic('natalie', 'wrong'),
          },
          body: JSON.stringify({ emoji: '🦊', sightedOn: '2026-07-05' }),
        })
      expect((await badAuth()).status).toBe(401)
      expect((await badAuth()).status).toBe(401)
      expect((await badAuth()).status).toBe(429) // 3rd failed attempt limited despite mutationPerMin=100
    })
  })
})
