import { describe, expect, it, vi } from 'vitest'
import { createNotifier } from './notify'

describe('createNotifier', () => {
  it('POSTs a tappable ntfy push when a PR opens', async () => {
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => new Response(null, { status: 200 }))
    const n = createNotifier({ url: 'https://ntfy.sh/secret-topic', fetch: fetch as unknown as typeof globalThis.fetch })
    await n.prOpened('Pelican', 'https://github.com/o/r/pull/9')

    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe('https://ntfy.sh/secret-topic')
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers.Title).toMatch(/PR opened/i)
    expect(headers.Click).toBe('https://github.com/o/r/pull/9') // tapping opens the PR
    expect(String(init.body)).toContain('Pelican')
  })

  it('POSTs a tappable push when a PR is updated by an iteration', async () => {
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => new Response(null, { status: 200 }))
    const n = createNotifier({ url: 'https://ntfy.sh/t', fetch: fetch as unknown as typeof globalThis.fetch })
    await n.prUpdated(83, 'https://github.com/o/r/pull/83')
    const [, init] = fetch.mock.calls[0]!
    const headers = init.headers as Record<string, string>
    expect(headers.Title).toMatch(/PR updated/i)
    expect(headers.Click).toBe('https://github.com/o/r/pull/83')
    expect(String(init.body)).toContain('#83')
  })

  it('is a no-op when no url is configured', async () => {
    const fetch = vi.fn()
    const n = createNotifier({ url: undefined, fetch: fetch as unknown as typeof globalThis.fetch })
    await n.prOpened('Otter', 'https://x/pull/1')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('never throws — a failed push cannot break the loop', async () => {
    const fetch = vi.fn(async () => {
      throw new Error('network down')
    })
    const n = createNotifier({ url: 'https://ntfy.sh/t', fetch: fetch as unknown as typeof globalThis.fetch })
    await expect(n.prOpened('Crab', 'https://x/pull/2')).resolves.toBeUndefined()
  })
})
