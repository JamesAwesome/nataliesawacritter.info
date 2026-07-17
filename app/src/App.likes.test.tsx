import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { markLiked } from './lib/likes'
import { makeSighting, stubFetchByUrl, useFakeClock } from './test/helpers'

afterEach(() => {
  localStorage.clear()
})

// App owns the optimistic like toggle (App.tsx `toggleLike`): flip the local
// heart + count immediately, then reconcile with the server's authoritative
// count, or roll back on failure. Exercised here through the real
// RecentCritters row rather than by unit-testing the callback directly,
// since the whole point is the UI never nests the like control inside the
// row-open button (SightingRow.test.tsx covers that structural guarantee).
describe('App like toggle', () => {
  useFakeClock()

  it('optimistically likes, then reconciles with the server count', async () => {
    const s = makeSighting({ name: 'Fox', likeCount: 2 })
    stubFetchByUrl({
      [`/api/sightings/${s.id}/like`]: [{ status: 200, body: { likeCount: 5 } }],
      '/api/sightings': [{ status: 200, body: [s] }],
    })
    render(<App />)
    const recent = await screen.findByTestId('recent-critters')
    const heart = within(recent).getByRole('button', { name: 'Like Fox' })

    await userEvent.click(heart)

    // optimistic flip lands immediately (no waiting for the server)
    expect(within(recent).getByRole('button', { name: 'Unlike Fox' })).toHaveAttribute('aria-pressed', 'true')
    // reconciled with the server's authoritative count (5, not the optimistic 3)
    await waitFor(() => expect(within(recent).getByText('5')).toBeInTheDocument())
  })

  it('optimistically unlikes an already-liked sighting', async () => {
    const s = makeSighting({ name: 'Fox', likeCount: 3 })
    markLiked(s.id)
    stubFetchByUrl({
      [`/api/sightings/${s.id}/like`]: [{ status: 200, body: { likeCount: 2 } }],
      '/api/sightings': [{ status: 200, body: [s] }],
    })
    render(<App />)
    const recent = await screen.findByTestId('recent-critters')
    const heart = within(recent).getByRole('button', { name: 'Unlike Fox' })

    await userEvent.click(heart)

    expect(within(recent).getByRole('button', { name: 'Like Fox' })).toHaveAttribute('aria-pressed', 'false')
    await waitFor(() => expect(within(recent).getByText('2')).toBeInTheDocument())
  })

  it('rolls back the heart and count when the request fails', async () => {
    const s = makeSighting({ name: 'Fox', likeCount: 2 })
    stubFetchByUrl({
      [`/api/sightings/${s.id}/like`]: [{ status: 500, body: { error: 'internal' } }],
      '/api/sightings': [{ status: 200, body: [s] }],
    })
    render(<App />)
    const recent = await screen.findByTestId('recent-critters')
    const heart = within(recent).getByRole('button', { name: 'Like Fox' })

    await userEvent.click(heart)

    await waitFor(() =>
      expect(within(recent).getByRole('button', { name: 'Like Fox' })).toHaveAttribute('aria-pressed', 'false'),
    )
    expect(within(recent).getByText('2')).toBeInTheDocument()
  })

  it('ignores a second tap while the first like request is still in flight', async () => {
    const s = makeSighting({ name: 'Fox', likeCount: 2 })
    let resolveLike!: (response: Response) => void
    const likeCall = vi.fn(() => new Promise<Response>((resolve) => { resolveLike = resolve }))
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : new URL(input.url, 'http://x').pathname
      if (url.startsWith(`/api/sightings/${s.id}/like`)) return likeCall()
      if (url.startsWith('/api/sightings')) return new Response(JSON.stringify([s]), { status: 200 })
      return new Response(JSON.stringify({ error: 'internal' }), { status: 500 })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    const recent = await screen.findByTestId('recent-critters')
    const heart = within(recent).getByRole('button', { name: 'Like Fox' })

    await userEvent.click(heart)
    // Second tap lands while the first request is still unresolved — must be a no-op.
    await userEvent.click(heart)

    expect(likeCall).toHaveBeenCalledTimes(1)

    resolveLike(new Response(JSON.stringify({ likeCount: 5 }), { status: 200 }))
    await waitFor(() => expect(within(recent).getByText('5')).toBeInTheDocument())
    expect(likeCall).toHaveBeenCalledTimes(1)
  })
})
