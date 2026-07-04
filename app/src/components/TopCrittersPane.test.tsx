import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { makeSighting } from '../test/helpers'
import { TopCrittersPane } from './TopCrittersPane'

describe('TopCrittersPane', () => {
  it('ranks sightings by count', () => {
    const rows = [
      makeSighting({ emoji: '🦊' }),
      makeSighting({ emoji: '🦊' }),
      makeSighting({ emoji: '🦉' }),
    ]
    render(<TopCrittersPane sightings={rows} />)
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('🦊')
    expect(items[0]).toHaveTextContent('2')
  })

  it('shows the empty state', () => {
    render(<TopCrittersPane sightings={[]} />)
    expect(screen.getByText(/no critters logged yet/i)).toBeInTheDocument()
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
  })
})
