import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { makeSighting } from '../test/helpers'
import { SightingRow } from './SightingRow'

describe('starred', () => {
  it('renders the star and the accessible friend suffix when starred', () => {
    render(
      <ul>
        <SightingRow sighting={makeSighting({ name: 'Mr Fox' })} starred onSelect={vi.fn()} />
      </ul>,
    )
    expect(screen.getByRole('button', { name: /Mr Fox.*, friend/ })).toBeInTheDocument()
    expect(screen.getByText('⭐')).toHaveAttribute('aria-hidden', 'true')
  })

  it('renders no star artifacts by default', () => {
    render(
      <ul>
        <SightingRow sighting={makeSighting({ name: 'Mr Fox' })} onSelect={vi.fn()} />
      </ul>,
    )
    expect(screen.queryByText('⭐')).not.toBeInTheDocument()
    expect(screen.queryByText(', friend')).not.toBeInTheDocument()
  })

  it('shows the resolved custom name (not the token) when the name is null', () => {
    render(<SightingRow sighting={makeSighting({ emoji: 'custom:robin', name: null })} onSelect={() => {}} />)
    expect(screen.getByText('Robin')).toBeInTheDocument()
    expect(screen.queryByText('custom:robin')).not.toBeInTheDocument()
  })
})

describe('quantity badge', () => {
  it('shows ×2 for a quantity of 2', () => {
    render(<SightingRow sighting={makeSighting({ name: 'Deer', quantity: '2' })} onSelect={() => {}} />)
    expect(screen.getByText('×2')).toBeInTheDocument()
  })

  it('shows Many for a quantity of many', () => {
    render(<SightingRow sighting={makeSighting({ name: 'Firefly', quantity: 'many' })} onSelect={() => {}} />)
    expect(screen.getByText('Many')).toBeInTheDocument()
  })

  it('shows no badge for a quantity of 1', () => {
    render(<SightingRow sighting={makeSighting({ name: 'Fox', quantity: '1' })} onSelect={() => {}} />)
    expect(screen.queryByText('×1')).not.toBeInTheDocument()
    expect(screen.queryByText(/Many/)).not.toBeInTheDocument()
  })
})
