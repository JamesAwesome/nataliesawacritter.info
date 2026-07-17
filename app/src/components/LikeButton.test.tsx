import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeSighting } from '../test/helpers'
import { markLiked } from '../lib/likes'
import { LikeButton } from './LikeButton'

beforeEach(() => {
  localStorage.clear()
  ;(navigator as { vibrate?: unknown }).vibrate = vi.fn()
})
afterEach(() => {
  delete (navigator as { vibrate?: unknown }).vibrate
})

const FOX = makeSighting({ id: 'fox', name: 'Mr Fox', likeCount: 2 })

describe('LikeButton', () => {
  it('renders the unliked heart, count, and accessible Like label', () => {
    render(<LikeButton sighting={FOX} onToggle={vi.fn()} />)
    const btn = screen.getByRole('button', { name: 'Like Mr Fox' })
    expect(btn).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('pops, vibrates, and fires onToggle on a new like', async () => {
    const onToggle = vi.fn()
    render(<LikeButton sighting={FOX} onToggle={onToggle} />)
    const btn = screen.getByRole('button', { name: 'Like Mr Fox' })
    await userEvent.click(btn)
    expect(btn).toHaveClass('popping')
    expect(navigator.vibrate).toHaveBeenCalledWith(15)
    expect(onToggle).toHaveBeenCalledWith(FOX)
  })

  it('does NOT pop or vibrate when unliking (no reward for removing a like)', async () => {
    markLiked(FOX.id) // this device already liked it → the tap is an unlike
    const onToggle = vi.fn()
    render(<LikeButton sighting={FOX} onToggle={onToggle} />)
    const btn = screen.getByRole('button', { name: 'Unlike Mr Fox' })
    await userEvent.click(btn)
    expect(btn).not.toHaveClass('popping')
    expect(navigator.vibrate).not.toHaveBeenCalled()
    expect(onToggle).toHaveBeenCalledWith(FOX)
  })

  it('clears the pop class after the animation window', () => {
    vi.useFakeTimers()
    try {
      render(<LikeButton sighting={FOX} onToggle={vi.fn()} />)
      const btn = screen.getByRole('button', { name: 'Like Mr Fox' })
      fireEvent.click(btn)
      expect(btn).toHaveClass('popping')
      act(() => {
        vi.advanceTimersByTime(300)
      })
      expect(btn).not.toHaveClass('popping')
    } finally {
      vi.useRealTimers()
    }
  })

  it('hides the count when it is zero', () => {
    render(<LikeButton sighting={makeSighting({ id: 'z', name: 'Owl', likeCount: 0 })} onToggle={vi.fn()} />)
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })
})
