import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
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
})
