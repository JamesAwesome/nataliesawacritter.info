import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { makeProfile, makeSighting, useFakeClock } from '../test/helpers'
import { friendKeys } from '../lib/friends'
import { HistoryPane } from './HistoryPane'

const ROWS = [
  makeSighting({ id: 'a', name: 'Fox', emoji: '🦊', sightedOn: '2026-07-20' }),
  makeSighting({ id: 'b', name: 'Owl', emoji: '🦉', sightedOn: '2026-07-10' }),
  makeSighting({ id: 'c', name: 'Frog', emoji: '🐸', sightedOn: '2026-07-01' }),
]

describe('HistoryPane', () => {
  useFakeClock()
  it('lists all sightings and hides Clear until a bound is set', () => {
    render(<HistoryPane sightings={ROWS} onSelect={() => {}} friendKeys={new Set<string>()} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument()
  })

  it('filters inclusively by From/To and shows Clear', () => {
    render(<HistoryPane sightings={ROWS} onSelect={() => {}} friendKeys={new Set<string>()} />)
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-07-05' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-07-20' } })
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[0]).getByText('Fox')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument()
  })

  it('Clear resets both bounds', async () => {
    render(<HistoryPane sightings={ROWS} onSelect={() => {}} friendKeys={new Set<string>()} />)
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-07-15' } })
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: /clear/i }))
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByLabelText('From')).toHaveValue('')
  })

  it('taps a row through onSelect', async () => {
    const onSelect = vi.fn()
    render(<HistoryPane sightings={ROWS} onSelect={onSelect} friendKeys={new Set<string>()} />)
    await userEvent.click(screen.getByRole('button', { name: /fox/i }))
    expect(onSelect).toHaveBeenCalledWith('a')
  })

  it('shows the empty state and the filtered-empty state', () => {
    const { rerender } = render(<HistoryPane sightings={[]} onSelect={() => {}} friendKeys={new Set<string>()} />)
    expect(screen.getByText(/no critters logged yet/i)).toBeInTheDocument()
    rerender(<HistoryPane sightings={ROWS} onSelect={() => {}} friendKeys={new Set<string>()} />)
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-08-01' } })
    expect(screen.getByText(/no critters in that range/i)).toBeInTheDocument()
  })
})

describe('text filter', () => {
  const NAMED = [
    makeSighting({ id: 'a', name: 'Mr Fox', emoji: '🦊', sightedOn: '2026-07-20', place: 'backyard' }),
    makeSighting({ id: 'b', name: null, emoji: '🐙', sightedOn: '2026-07-10' }), // species: Octopus
    makeSighting({ id: 'c', name: 'Hoppy', emoji: '🐸', sightedOn: '2026-07-01', place: 'creek trail' }),
  ]

  it('filters by given name, case-insensitively', async () => {
    render(<HistoryPane sightings={NAMED} onSelect={() => {}} friendKeys={new Set<string>()} />)
    await userEvent.type(screen.getByLabelText('Filter critters'), 'hoppy')
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText('Hoppy')).toBeInTheDocument()
  })

  it('matches the species name for an unnamed sighting (like the picker filter)', async () => {
    render(<HistoryPane sightings={NAMED} onSelect={() => {}} friendKeys={new Set<string>()} />)
    await userEvent.type(screen.getByLabelText('Filter critters'), 'octopus')
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText('Octopus')).toBeInTheDocument()
  })

  it('matches the place', async () => {
    render(<HistoryPane sightings={NAMED} onSelect={() => {}} friendKeys={new Set<string>()} />)
    await userEvent.type(screen.getByLabelText('Filter critters'), 'creek')
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText('Hoppy')).toBeInTheDocument()
  })

  it('composes with the date range and shows the no-match message', async () => {
    render(<HistoryPane sightings={NAMED} onSelect={() => {}} friendKeys={new Set<string>()} />)
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-07-15' } })
    await userEvent.type(screen.getByLabelText('Filter critters'), 'hoppy') // exists, but out of range
    expect(screen.getByText(/No critters match “hoppy”/)).toBeInTheDocument()
  })

  it('Clear resets the text along with the other filters', async () => {
    render(<HistoryPane sightings={NAMED} onSelect={() => {}} friendKeys={new Set<string>()} />)
    await userEvent.type(screen.getByLabelText('Filter critters'), 'fox')
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: /clear/i }))
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByLabelText('Filter critters')).toHaveValue('')
  })
})

describe('friends filter', () => {
  const FOX = makeSighting({ emoji: '🦊', name: 'Mr Fox', sightedOn: '2026-07-01' })
  const OWL = makeSighting({ emoji: '🦉', name: 'Prof Hoot', sightedOn: '2026-07-02' })
  const KEYS = friendKeys([makeProfile({ emoji: '🦊', name: 'mr fox' })])

  it('chip toggles aria-pressed and filters to friends', async () => {
    render(<HistoryPane sightings={[FOX, OWL]} onSelect={vi.fn()} friendKeys={KEYS} />)
    const chip = screen.getByRole('button', { name: '⭐ Friends' })
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Mr Fox')).toBeInTheDocument()
    expect(screen.queryByText('Prof Hoot')).not.toBeInTheDocument()
  })

  it('composes with the date range', async () => {
    render(<HistoryPane sightings={[FOX, OWL]} onSelect={vi.fn()} friendKeys={KEYS} />)
    await userEvent.click(screen.getByRole('button', { name: '⭐ Friends' }))
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-07-02' } })
    expect(screen.queryByText('Mr Fox')).not.toBeInTheDocument()
    expect(screen.getByText('No friend sightings here 😿')).toBeInTheDocument()
  })

  it('Clear appears for the chip alone and resets it with the dates', async () => {
    render(<HistoryPane sightings={[FOX, OWL]} onSelect={vi.fn()} friendKeys={KEYS} />)
    expect(screen.queryByText('Clear')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '⭐ Friends' }))
    await userEvent.click(screen.getByText('Clear'))
    expect(screen.getByRole('button', { name: '⭐ Friends' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('Prof Hoot')).toBeInTheDocument()
  })

  it('friend rows in History carry the star', () => {
    render(<HistoryPane sightings={[FOX, OWL]} onSelect={vi.fn()} friendKeys={KEYS} />)
    expect(screen.getByRole('button', { name: /Mr Fox.*, friend/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Prof Hoot/ })).not.toHaveAccessibleName(/, friend/)
  })
})
