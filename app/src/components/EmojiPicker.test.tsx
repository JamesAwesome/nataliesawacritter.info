import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { EmojiPicker } from './EmojiPicker'

describe('EmojiPicker recently-seen row', () => {
  it('hides the recent row when there are no recent emoji', () => {
    render(<EmojiPicker recent={[]} onPick={() => {}} onCancel={() => {}} />)
    expect(screen.queryByText('Recently seen')).not.toBeInTheDocument()
    // curated grid still present
    expect(screen.getByRole('button', { name: 'Deer' })).toBeInTheDocument()
  })

  it('shows recent emoji above the curated grid and pre-fills a curated name on pick', async () => {
    const onPick = vi.fn()
    render(<EmojiPicker recent={['🦊', '🐙']} onPick={onPick} onCancel={() => {}} />)
    expect(screen.getByText('Recently seen')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Recently seen Fox' }))
    expect(onPick).toHaveBeenCalledWith('🦊', 'Fox')
  })

  it('leaves the name blank when a recent non-curated emoji is picked', async () => {
    const onPick = vi.fn()
    render(<EmojiPicker recent={['🐙']} onPick={onPick} onCancel={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Recently seen 🐙' }))
    expect(onPick).toHaveBeenCalledWith('🐙', null)
  })

  it('still shows the curated Fox tile distinctly from the recent Fox', () => {
    render(<EmojiPicker recent={['🦊']} onPick={() => {}} onCancel={() => {}} />)
    expect(screen.getByRole('button', { name: 'Fox' })).toBeInTheDocument() // curated
    expect(screen.getByRole('button', { name: 'Recently seen Fox' })).toBeInTheDocument() // recent
  })
})
