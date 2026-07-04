import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makeSighting } from '../test/helpers'
import { RecentCritters } from './RecentCritters'

const SIGHTED_ON = '2026-07-03'
const CREATED_AT = '2026-07-03T12:00:00.000Z'

describe('RecentCritters', () => {
  it('renders at most 4 rows, most recent first, with formatted meta', () => {
    const sightings = [
      makeSighting({ name: 'Fox', sightedTime: 'dusk', sightedOn: SIGHTED_ON, createdAt: CREATED_AT }),
      makeSighting({ name: 'Owl', emoji: '🦉', sightedOn: SIGHTED_ON, createdAt: CREATED_AT }),
      makeSighting({ name: 'Deer', emoji: '🦌', sightedOn: SIGHTED_ON, createdAt: CREATED_AT }),
      makeSighting({ name: 'Duck', emoji: '🦆', sightedOn: SIGHTED_ON, createdAt: CREATED_AT }),
      makeSighting({ name: 'Frog', emoji: '🐸', sightedOn: SIGHTED_ON, createdAt: CREATED_AT }),
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
    render(
      <RecentCritters
        sightings={[makeSighting({ name: null, sightedOn: SIGHTED_ON, createdAt: CREATED_AT })]}
        status="ready"
        onRetry={() => {}}
      />,
    )
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

  it('invokes onSelect with the sighting id when a row is tapped', async () => {
    const onSelect = vi.fn()
    const s = makeSighting()
    render(<RecentCritters sightings={[s]} status="ready" onRetry={() => {}} onSelect={onSelect} />)
    await userEvent.click(screen.getByRole('button', { name: /fox/i }))
    expect(onSelect).toHaveBeenCalledWith(s.id)
  })
})
