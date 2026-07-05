import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import App from './App'
import { makeSighting } from './test/helpers'

const ROW = makeSighting()

// Mutable holder so each render of the mocked hook can return a fresh
// sightings array — this is how we simulate the sighting vanishing out from
// under an already-open detail sheet (e.g. a background refetch/removal).
const sightingsState = vi.hoisted(() => ({
  current: {
    sightings: [] as ReturnType<typeof makeSighting>[],
    status: 'ready' as const,
    addSighting: vi.fn(),
    removeSighting: vi.fn(),
    applySighting: vi.fn(),
    retry: vi.fn(),
  },
}))

vi.mock('./hooks/useSightings', () => ({
  useSightings: () => sightingsState.current,
}))

vi.mock('./hooks/useProfiles', () => ({
  useProfiles: () => ({
    profiles: [],
    status: 'ready',
    addProfile: vi.fn(),
    removeProfile: vi.fn(),
    retry: vi.fn(),
  }),
}))

describe('stale-sheet self-heal (App.tsx adjust-during-render)', () => {
  it('closes an open sighting detail sheet the instant its sighting disappears from the list', async () => {
    sightingsState.current = {
      sightings: [ROW],
      status: 'ready',
      addSighting: vi.fn(),
      removeSighting: vi.fn(),
      applySighting: vi.fn(),
      retry: vi.fn(),
    }
    const { rerender } = render(<App />)

    const recent = await screen.findByTestId('recent-critters')
    await userEvent.click(within(recent).getByRole('button', { name: /fox/i }))
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()

    // The sighting the open sheet points at is now gone.
    sightingsState.current = { ...sightingsState.current, sightings: [] }
    rerender(<App />)

    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    expect(document.querySelector('.sheet-scrim')).toBeNull()

    // If the row returns, a healed sheet stays closed (state cleared, not merely hidden)
    sightingsState.current = { ...sightingsState.current, sightings: [ROW] }
    rerender(<App />)
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })
})
