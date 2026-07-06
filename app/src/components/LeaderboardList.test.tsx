import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { LeaderRow } from '../lib/insights'
import { LeaderboardList } from './LeaderboardList'

const ROWS: LeaderRow[] = [
  { emoji: '🦊', name: null, count: 10 },
  { emoji: '🦉', name: null, count: 5 },
  { emoji: '🐸', name: null, count: 3 },
  { emoji: '🐢', name: null, count: 1 },
]

describe('LeaderboardList', () => {
  it('renders rank medals for the top 3 then #N', () => {
    render(<LeaderboardList rows={ROWS} />)
    const items = screen.getAllByRole('listitem')
    expect(within(items[0]).getByText('🥇')).toBeInTheDocument()
    expect(within(items[1]).getByText('🥈')).toBeInTheDocument()
    expect(within(items[2]).getByText('🥉')).toBeInTheDocument()
    expect(within(items[3]).getByText('#4')).toBeInTheDocument()
  })

  it('shows counts and preserves input (ranked) order', () => {
    render(<LeaderboardList rows={ROWS} />)
    const items = screen.getAllByRole('listitem')
    expect(within(items[0]).getByText('10')).toBeInTheDocument()
    expect(within(items[3]).getByText('1')).toBeInTheDocument()
  })

  it('scales bar width by count/max and floors it at 8%', () => {
    render(<LeaderboardList rows={[{ emoji: '🦊', name: null, count: 100 }, { emoji: '🐢', name: null, count: 1 }]} />)
    const fills = document.querySelectorAll<HTMLElement>('.leader-bar-fill')
    expect(fills[0].style.width).toBe('100%') // max
    expect(fills[1].style.width).toBe('8%') // 1/100 = 1% → floored to 8%
  })

  it('rounds bar widths to two decimals', () => {
    render(<LeaderboardList rows={[{ emoji: '🦊', name: null, count: 3 }, { emoji: '🦉', name: null, count: 1 }]} />)
    const fills = document.querySelectorAll<HTMLElement>('.leader-bar-fill')
    expect(fills[1].style.width).toBe('33.33%')
  })

  it('rows are not tappable (no buttons)', () => {
    render(<LeaderboardList rows={ROWS} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows the name for a named row and only the emoji for an unnamed one', () => {
    render(
      <LeaderboardList
        rows={[
          { emoji: '🐦', name: 'Cardinal', count: 5 },
          { emoji: '🦊', name: null, count: 2 },
        ]}
      />,
    )
    const items = screen.getAllByRole('listitem')
    expect(within(items[0]).getByText('Cardinal')).toBeInTheDocument()
    expect(items[0]).toHaveAttribute('aria-label', 'Rank 1: Cardinal, 5 sightings')
    // unnamed row: no extra name text, aria falls back to the curated name
    expect(within(items[1]).queryByText('Cardinal')).not.toBeInTheDocument()
    expect(items[1]).toHaveAttribute('aria-label', 'Rank 2: Fox, 2 sightings')
  })

  it('keeps the grid at four cells so the bar is never pushed out (name lives in the critter cell)', () => {
    render(
      <LeaderboardList
        rows={[
          { emoji: '🐦', name: 'Cardinal', count: 5 },
          { emoji: '🦊', name: null, count: 2 },
        ]}
      />,
    )
    const items = screen.getAllByRole('listitem')
    // The grid template has 4 tracks; every row (named or not) must have exactly
    // 4 direct children, or a stray child wraps and collapses the bar to 0 width.
    for (const item of items) {
      expect(item.children).toHaveLength(4)
      expect(item.querySelector('.leader-bar-track')).not.toBeNull()
    }
    // The name sits inside the critter cell next to the emoji, not as a 5th grid child.
    const critter = items[0].querySelector('.leader-critter')
    expect(critter).not.toBeNull()
    expect(within(critter as HTMLElement).getByText('Cardinal')).toBeInTheDocument()
  })
})
