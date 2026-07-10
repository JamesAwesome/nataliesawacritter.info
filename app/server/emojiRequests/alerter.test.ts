import { describe, expect, it, vi } from 'vitest'
import { createRequestAlerter } from './alerter.js'

describe('request alerter (ntfy)', () => {
  it('posts the request to the configured topic with a title', async () => {
    const send = vi.fn(async () => {})
    const alerter = createRequestAlerter({ config: { url: 'https://ntfy.sh/secret' }, send })
    await alerter.notify({ name: 'Pigeon', note: 'the city kind' })
    expect(send).toHaveBeenCalledWith('https://ntfy.sh/secret', {
      title: 'New emoji request',
      tags: 'sparkles',
      body: 'Pigeon — the city kind',
    })
  })

  it('omits the note from the body when absent', async () => {
    const send = vi.fn(async () => {})
    await createRequestAlerter({ config: { url: 'https://ntfy.sh/x' }, send }).notify({ name: 'Otter', note: null })
    expect(send).toHaveBeenCalledWith('https://ntfy.sh/x', expect.objectContaining({ body: 'Otter' }))
  })

  it('is a no-op when unconfigured (NTFY_URL unset)', async () => {
    const send = vi.fn(async () => {})
    await createRequestAlerter({ config: null, send }).notify({ name: 'Pigeon', note: null })
    expect(send).not.toHaveBeenCalled()
  })

  it('never throws when the transport fails', async () => {
    const send = vi.fn(async () => {
      throw new Error('network down')
    })
    await expect(
      createRequestAlerter({ config: { url: 'https://ntfy.sh/x' }, send }).notify({ name: 'Pigeon', note: null }),
    ).resolves.toBeUndefined()
  })
})
