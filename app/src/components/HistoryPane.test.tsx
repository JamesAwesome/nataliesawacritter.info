import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { makeSighting, useFakeClock } from '../test/helpers'
import { HistoryPane } from './HistoryPane'

// eslint-disable-next-line react-hooks/rules-of-hooks
useFakeClock()

const ROWS = [
  makeSighting({ id: 'a', name: 'Fox', emoji: '🦊', sightedOn: '2026-07-20' }),
  makeSighting({ id: 'b', name: 'Owl', emoji: '🦉', sightedOn: '2026-07-10' }),
  makeSighting({ id: 'c', name: 'Frog', emoji: '🐸', sightedOn: '2026-07-01' }),
]

describe('HistoryPane', () => {
  it('lists all sightings and hides Clear until a bound is set', () => {
    render(<HistoryPane sightings={ROWS} onSelect={() => {}} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument()
  })

  it('filters inclusively by From/To and shows Clear', () => {
    render(<HistoryPane sightings={ROWS} onSelect={() => {}} />)
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-07-05' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-07-20' } })
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[0]).getByText('Fox')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument()
  })

  it('Clear resets both bounds', async () => {
    render(<HistoryPane sightings={ROWS} onSelect={() => {}} />)
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-07-15' } })
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: /clear/i }))
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByLabelText('From')).toHaveValue('')
  })

  it('taps a row through onSelect', async () => {
    const onSelect = vi.fn()
    render(<HistoryPane sightings={ROWS} onSelect={onSelect} />)
    await userEvent.click(screen.getByRole('button', { name: /fox/i }))
    expect(onSelect).toHaveBeenCalledWith('a')
  })

  it('shows the empty state and the filtered-empty state', () => {
    const { rerender } = render(<HistoryPane sightings={[]} onSelect={() => {}} />)
    expect(screen.getByText(/no critters logged yet/i)).toBeInTheDocument()
    rerender(<HistoryPane sightings={ROWS} onSelect={() => {}} />)
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-08-01' } })
    expect(screen.getByText(/no critters in that range/i)).toBeInTheDocument()
  })
})
