import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CritterGlyph } from './CritterGlyph'

describe('CritterGlyph', () => {
  it('renders an img with the slug src for a known custom token', () => {
    const { container } = render(<CritterGlyph emoji="custom:robin" className="x" />)
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('src')).toBe('/custom-emoji/robin.svg')
    expect(img?.getAttribute('class')).toContain('x')
  })

  it('renders a text span for a Unicode emoji', () => {
    const { container } = render(<CritterGlyph emoji="🦊" className="x" />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toBe('🦊')
  })
})
