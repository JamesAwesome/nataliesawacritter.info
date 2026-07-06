import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Footer } from './Footer'

describe('Footer', () => {
  it('links the author name to their GitHub in a new tab', () => {
    render(<Footer />)
    const link = screen.getByRole('link', { name: 'James Awesome' })
    expect(link).toHaveAttribute('href', 'https://github.com/JamesAwesome')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('shows a copyright line with the author', () => {
    render(<Footer />)
    // Match the © glyph + name, not the literal year (survives the calendar rollover).
    expect(screen.getByText(/©/)).toBeInTheDocument()
    expect(screen.getByText(/James Awesome/)).toBeInTheDocument()
  })
})
