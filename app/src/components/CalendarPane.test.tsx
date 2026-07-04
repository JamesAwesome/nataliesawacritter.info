import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makeSighting, useFakeClock } from '../test/helpers'
import { CalendarPane } from './CalendarPane'

describe('CalendarPane', () => {
  useFakeClock() // system time fixed at 2026-07-03

  it('renders the current month with weekday headers', () => {
    render(<CalendarPane sightings={[]} onDayOpen={() => {}} />)
    expect(screen.getByText('July 2026')).toBeInTheDocument()
    expect(screen.getAllByText('S')).toHaveLength(2) // Sun + Sat
  })

  it('navigates months across year boundaries', async () => {
    render(<CalendarPane sightings={[]} onDayOpen={() => {}} />)
    for (let i = 0; i < 7; i++) await userEvent.click(screen.getByRole('button', { name: /next month/i }))
    expect(screen.getByText('February 2027')).toBeInTheDocument()
    for (let i = 0; i < 8; i++) await userEvent.click(screen.getByRole('button', { name: /previous month/i }))
    expect(screen.getByText('June 2026')).toBeInTheDocument()
  })

  it('shows up to two emoji plus +N and makes only sighting days clickable', async () => {
    const onDayOpen = vi.fn()
    const day = '2026-07-02'
    const sightings = [
      makeSighting({ sightedOn: day, emoji: '🦌' }),
      makeSighting({ sightedOn: day, emoji: '🐦' }),
      makeSighting({ sightedOn: day, emoji: '🦊' }),
    ]
    render(<CalendarPane sightings={sightings} onDayOpen={onDayOpen} />)
    const cell = screen.getByRole('button', { name: /jul 2/i })
    expect(cell).toHaveTextContent('🦌🐦 +1')
    expect(cell).toHaveAccessibleName('Jul 2, 3 sightings')
    await userEvent.click(cell)
    expect(onDayOpen).toHaveBeenCalledWith(day)
    // a random empty day is not a button
    expect(screen.queryByRole('button', { name: /jul 9/i })).not.toBeInTheDocument()
  })

  it('marks today and dims out-of-month cells', () => {
    render(<CalendarPane sightings={[]} onDayOpen={() => {}} />)
    expect(document.querySelector('.day-cell.today')).not.toBeNull()
    expect(document.querySelectorAll('.day-cell.out-month').length).toBeGreaterThan(0)
  })
})
