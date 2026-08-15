import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QuantityBadge } from './QuantityBadge'

describe('QuantityBadge', () => {
  it('renders nothing for a quantity of 1', () => {
    const { container } = render(<QuantityBadge quantity="1" emoji="🦊" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders ×N for 2 and 3, with no collective-noun phrase', () => {
    render(<QuantityBadge quantity="2" emoji="🦊" />)
    expect(screen.getByText('×2')).toBeInTheDocument()
    expect(screen.getByText('×2')).not.toHaveAttribute('title')
  })

  it('renders the collective noun with the phrase as title and for screen readers', () => {
    render(<QuantityBadge quantity="many" emoji="🐦‍⬛" />)
    const badge = screen.getByText('Murder')
    expect(badge).toHaveAttribute('title', 'a murder of crows')
    expect(badge).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByText(', a murder of crows')).toHaveClass('visually-hidden')
  })

  it('falls back to a plain Many badge for a critter with no collective noun', () => {
    render(<QuantityBadge quantity="many" emoji="custom:gritty" />)
    const badge = screen.getByText('Many')
    expect(badge).not.toHaveAttribute('title')
    expect(badge).not.toHaveAttribute('aria-hidden')
  })
})
