import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { LeaderRow } from '../lib/insights'
import { LeaderboardList } from './LeaderboardList'

const ROWS: LeaderRow[] = [
  { emoji: '🦊', count: 10 },
  { emoji: '🦉', count: 5 },
  { emoji: '🐸', count: 3 },
  { emoji: '🐢', count: 1 },
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
    render(<LeaderboardList rows={[{ emoji: '🦊', count: 100 }, { emoji: '🐢', count: 1 }]} />)
    const fills = document.querySelectorAll<HTMLElement>('.leader-bar-fill')
    expect(fills[0].style.width).toBe('100%') // max
    expect(fills[1].style.width).toBe('8%') // 1/100 = 1% → floored to 8%
  })

  it('rounds bar widths to two decimals', () => {
    render(<LeaderboardList rows={[{ emoji: '🦊', count: 3 }, { emoji: '🦉', count: 1 }]} />)
    const fills = document.querySelectorAll<HTMLElement>('.leader-bar-fill')
    expect(fills[1].style.width).toBe('33.33%')
  })

  it('rows are not tappable (no buttons)', () => {
    render(<LeaderboardList rows={ROWS} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
