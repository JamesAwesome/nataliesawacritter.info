import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Sighting } from '../api'
import { RecentCritters } from './RecentCritters'

function row(overrides: Partial<Sighting>): Sighting {
  return {
    id: crypto.randomUUID(), emoji: '🦊', name: 'Fox', sightedOn: '2026-07-03',
    sightedTime: null, place: null, comment: null, photoPath: null,
    createdAt: '2026-07-03T12:00:00.000Z', ...overrides,
  }
}

describe('RecentCritters', () => {
  it('renders at most 4 rows, most recent first, with formatted meta', () => {
    const sightings = [
      row({ name: 'Fox', sightedTime: 'dusk' }),
      row({ name: 'Owl', emoji: '🦉' }),
      row({ name: 'Deer', emoji: '🦌' }),
      row({ name: 'Duck', emoji: '🦆' }),
      row({ name: 'Frog', emoji: '🐸' }),
    ]
    render(<RecentCritters sightings={sightings} status="ready" onRetry={() => {}} />)
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(4)
    expect(items[0]).toHaveTextContent('Fox')
    expect(items[0]).toHaveTextContent('Jul 3 · dusk')
    expect(items[1]).toHaveTextContent('Jul 3 · just now')
    expect(screen.queryByText('Frog')).not.toBeInTheDocument()
  })

  it('falls back to the emoji when name is null', () => {
    render(<RecentCritters sightings={[row({ name: null })]} status="ready" onRetry={() => {}} />)
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('🦊')
  })

  it('shows the empty state when there are no sightings', () => {
    render(<RecentCritters sightings={[]} status="ready" onRetry={() => {}} />)
    expect(screen.getByText(/no critters yet/i)).toBeInTheDocument()
  })

  it('shows error state with a retry button', async () => {
    const onRetry = vi.fn()
    render(<RecentCritters sightings={[]} status="error" onRetry={onRetry} />)
    expect(screen.getByText(/couldn't load sightings/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
