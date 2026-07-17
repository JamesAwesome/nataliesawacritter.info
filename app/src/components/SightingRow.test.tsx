import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeSighting } from '../test/helpers'
import { markLiked } from '../lib/likes'
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

describe('photo indicator', () => {
  it('renders the 📸 and an accessible suffix when the sighting has a photo', () => {
    render(
      <ul>
        <SightingRow sighting={makeSighting({ name: 'Mr Fox', photoPath: '/api/photos/x.jpg' })} onSelect={vi.fn()} />
      </ul>,
    )
    expect(screen.getByRole('button', { name: /Mr Fox.*has photo/ })).toBeInTheDocument()
    expect(screen.getByText('📸')).toHaveAttribute('aria-hidden', 'true')
  })

  it('renders no photo artifacts when there is no photo', () => {
    render(
      <ul>
        <SightingRow sighting={makeSighting({ name: 'Mr Fox', photoPath: null })} onSelect={vi.fn()} />
      </ul>,
    )
    expect(screen.queryByText('📸')).not.toBeInTheDocument()
    expect(screen.queryByText(', has photo')).not.toBeInTheDocument()
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

describe('like button', () => {
  beforeEach(() => localStorage.clear())

  it('renders heart + count as a separate control from the row-open button', async () => {
    const onSelect = vi.fn()
    const onToggleLike = vi.fn()
    const s = makeSighting({ name: 'Mr Fox', likeCount: 2 })
    render(<ul><SightingRow sighting={s} onSelect={onSelect} onToggleLike={onToggleLike} /></ul>)

    const like = screen.getByRole('button', { name: 'Like Mr Fox' })
    expect(like).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('2')).toBeInTheDocument()
    // separate controls: liking must not open the sighting
    await userEvent.click(like)
    expect(onToggleLike).toHaveBeenCalledWith(s)
    expect(onSelect).not.toHaveBeenCalled()
    // no nesting (a11y): the like button is not inside the open button
    expect(screen.getByRole('button', { name: /^Mr Fox/ }).contains(like)).toBe(false)
  })

  it('shows a filled pressed heart when this device liked it, and hides a 0 count', () => {
    const s = makeSighting({ name: 'Mr Fox', likeCount: 0 })
    markLiked(s.id)
    render(<ul><SightingRow sighting={s} onToggleLike={vi.fn()} /></ul>)
    expect(screen.getByRole('button', { name: 'Unlike Mr Fox' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('renders no like button without onToggleLike', () => {
    render(<ul><SightingRow sighting={makeSighting({ likeCount: 5 })} onSelect={vi.fn()} /></ul>)
    expect(screen.queryByRole('button', { name: /like/i })).not.toBeInTheDocument()
  })
})
