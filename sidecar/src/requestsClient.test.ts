import { describe, expect, it, vi } from 'vitest'
import { createRequestsClient } from './requestsClient'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('requestsClient', () => {
  const base = 'http://app:8080'
  const auth = 'Basic xyz'

  it('lists pending with the auth header and maps rows', async () => {
    const fetch = vi.fn(async () =>
      jsonResponse([{ id: 'a', name: 'Pigeon', note: 'city', createdAt: 'x', handledAt: null }]),
    )
    const client = createRequestsClient({ baseUrl: base, authHeader: auth, fetch: fetch as unknown as typeof globalThis.fetch })
    const rows = await client.listPending()
    expect(rows).toEqual([{ id: 'a', name: 'Pigeon', note: 'city' }])
    expect(fetch).toHaveBeenCalledWith(`${base}/api/emoji-requests?pending=1`, { headers: { authorization: auth } })
  })

  it('PATCHes handled with pr_url present, and omits it when null', async () => {
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => new Response(null, { status: 200 }))
    const client = createRequestsClient({ baseUrl: base, authHeader: auth, fetch: fetch as unknown as typeof globalThis.fetch })

    await client.markHandled('a', { outcome: 'pr-opened', prUrl: 'https://x/pull/1' })
    expect(JSON.parse(fetch.mock.calls[0]![1].body as string)).toEqual({
      outcome: 'pr-opened',
      pr_url: 'https://x/pull/1',
    })

    await client.markHandled('b', { outcome: 'skipped-copyright', prUrl: null })
    expect(JSON.parse(fetch.mock.calls[1]![1].body as string)).toEqual({ outcome: 'skipped-copyright' })
  })

  it('throws on a non-ok response', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 401 }))
    const client = createRequestsClient({ baseUrl: base, authHeader: auth, fetch: fetch as unknown as typeof globalThis.fetch })
    await expect(client.listPending()).rejects.toThrow(/401/)
  })

  it('lists only pr-opened requests that have a url', async () => {
    const fetch = vi.fn(async () =>
      jsonResponse([
        { id: 'a', name: 'Deer', outcome: 'pr-opened', prUrl: 'https://x/pull/1' },
        { id: 'b', name: 'Owl', outcome: 'skipped-copyright', prUrl: null },
        { id: 'c', name: 'Fox', outcome: null, prUrl: null }, // pending
        { id: 'd', name: 'Bat', outcome: 'pr-opened', prUrl: null }, // no url → excluded
      ]),
    )
    const client = createRequestsClient({ baseUrl: base, authHeader: auth, fetch: fetch as unknown as typeof globalThis.fetch })
    expect(await client.listPrOpened()).toEqual([{ id: 'a', name: 'Deer', prUrl: 'https://x/pull/1' }])
    expect(fetch).toHaveBeenCalledWith(`${base}/api/emoji-requests`, { headers: { authorization: auth } })
  })

  it('DELETEs a request', async () => {
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => new Response(null, { status: 204 }))
    const client = createRequestsClient({ baseUrl: base, authHeader: auth, fetch: fetch as unknown as typeof globalThis.fetch })
    await client.remove('a')
    expect(fetch).toHaveBeenCalledWith(`${base}/api/emoji-requests/a`, {
      method: 'DELETE',
      headers: { authorization: auth },
    })
  })
})
