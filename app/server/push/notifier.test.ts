import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Sighting } from '../sightings/store.js'
import { createNotifier, payloadFor, type SendPush } from './notifier.js'
import type { PushStore, PushSubscriptionRow } from './store.js'

const CONFIG = { subject: 'mailto:james@example.com', publicKey: 'pub-key', privateKey: 'priv-key' }
const TODAY = () => '2026-07-05'

function sighting(overrides: Partial<Sighting> = {}): Sighting {
  return {
    id: '3f9a26cc-1c0e-4c3a-9b52-08a1c2f4d9aa',
    emoji: '🦝',
    name: null,
    sightedOn: '2026-07-05',
    sightedTime: null,
    place: null,
    comment: null,
    photoPath: null,
    createdAt: new Date('2026-07-05T12:00:00Z'),
    ...overrides,
  }
}

function row(endpoint: string): PushSubscriptionRow {
  return { id: endpoint, endpoint, p256dh: 'p', auth: 'a', createdAt: new Date('2026-07-05T00:00:00Z') }
}

function fakeStore(overrides: Partial<PushStore> = {}): PushStore {
  return {
    upsert: vi.fn(async () => {}),
    removeByEndpoint: vi.fn(async () => true),
    listAll: vi.fn(async () => [row('https://push.example.com/1')]),
    ...overrides,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('payloadFor', () => {
  it('titles a named sighting with emoji and name', () => {
    const payload = JSON.parse(payloadFor(sighting({ name: 'Mr Fox', emoji: '🦊' }))) as Record<string, string>
    expect(payload.title).toBe('🦊 Natalie saw Mr Fox!')
    expect(payload.url).toBe('/')
  })

  it('falls back to "a critter" when unnamed and joins place/comment with an em dash', () => {
    const payload = JSON.parse(
      payloadFor(sighting({ place: 'the garden', comment: 'so fluffy' })),
    ) as Record<string, string>
    expect(payload.title).toBe('🦝 Natalie saw a critter!')
    expect(payload.body).toBe('the garden — so fluffy')
  })

  it('body is just the present part, or empty when both are null', () => {
    expect((JSON.parse(payloadFor(sighting({ place: 'the garden' }))) as { body: string }).body).toBe('the garden')
    expect((JSON.parse(payloadFor(sighting())) as { body: string }).body).toBe('')
  })

  it('uses the stand-in for a custom emoji in the push title', () => {
    const payload = JSON.parse(payloadFor(sighting({ emoji: 'custom:robin', name: 'Robin' }))) as { title: string }
    expect(payload.title).toBe('🐦 Natalie saw Robin!')
  })
})

describe('notifySighting', () => {
  it('sends the payload to every subscription', async () => {
    const store = fakeStore({
      listAll: vi.fn(async () => [row('https://push.example.com/1'), row('https://push.example.com/2')]),
    })
    const send = vi.fn<SendPush>(async () => ({}))
    await createNotifier({ config: CONFIG, store, send, today: TODAY }).notifySighting(sighting())
    expect(send).toHaveBeenCalledTimes(2)
    expect(send).toHaveBeenCalledWith(
      { endpoint: 'https://push.example.com/1', keys: { p256dh: 'p', auth: 'a' } },
      payloadFor(sighting()),
    )
  })

  it('sends for yesterday but not two days ago', async () => {
    const store = fakeStore()
    const send = vi.fn<SendPush>(async () => ({}))
    const notifier = createNotifier({ config: CONFIG, store, send, today: TODAY })
    await notifier.notifySighting(sighting({ sightedOn: '2026-07-04' }))
    expect(send).toHaveBeenCalledTimes(1)
    await notifier.notifySighting(sighting({ sightedOn: '2026-07-03' }))
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('is a no-op when unconfigured', async () => {
    const store = fakeStore()
    const send = vi.fn<SendPush>(async () => ({}))
    await createNotifier({ config: null, store, send, today: TODAY }).notifySighting(sighting())
    expect(store.listAll).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  it.each([404, 410])('prunes a subscription on statusCode %i', async (statusCode) => {
    const store = fakeStore({
      listAll: vi.fn(async () => [row('https://push.example.com/dead'), row('https://push.example.com/live')]),
    })
    const send = vi.fn<SendPush>(async (target) => {
      if (target.endpoint.endsWith('/dead')) throw Object.assign(new Error('gone'), { statusCode })
      return {}
    })
    await createNotifier({ config: CONFIG, store, send, today: TODAY }).notifySighting(sighting())
    expect(store.removeByEndpoint).toHaveBeenCalledExactlyOnceWith('https://push.example.com/dead')
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('logs transient failures without pruning, and other sends still deliver', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = fakeStore({
      listAll: vi.fn(async () => [row('https://push.example.com/flaky'), row('https://push.example.com/live')]),
    })
    const send = vi.fn<SendPush>(async (target) => {
      if (target.endpoint.endsWith('/flaky')) throw Object.assign(new Error('boom'), { statusCode: 500 })
      return {}
    })
    await createNotifier({ config: CONFIG, store, send, today: TODAY }).notifySighting(sighting())
    expect(store.removeByEndpoint).not.toHaveBeenCalled()
    expect(send).toHaveBeenCalledTimes(2)
    expect(error).toHaveBeenCalled()
  })

  it('never rejects even when the store itself throws', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = fakeStore({ listAll: vi.fn(async () => { throw new Error('db down') }) })
    await expect(
      createNotifier({ config: CONFIG, store, send: vi.fn(), today: TODAY }).notifySighting(sighting()),
    ).resolves.toBeUndefined()
    expect(error).toHaveBeenCalled()
  })
})
