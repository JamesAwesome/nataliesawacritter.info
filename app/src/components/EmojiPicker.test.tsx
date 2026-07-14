import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { EmojiPicker } from './EmojiPicker'
import { makeProfile } from '../test/helpers'

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

  it('pre-fills a known extended name, and leaves it blank for a truly unknown recent emoji', async () => {
    const onPick = vi.fn()
    render(<EmojiPicker recent={['🐙', '🍎']} onPick={onPick} onCancel={() => {}} />)
    // extended emoji are named now, so a recent octopus pre-fills "Octopus"
    await userEvent.click(screen.getByRole('button', { name: 'Recently seen Octopus' }))
    expect(onPick).toHaveBeenCalledWith('🐙', 'Octopus')
    // a non-critter emoji we don't name still leaves the name blank
    await userEvent.click(screen.getByRole('button', { name: 'Recently seen 🍎' }))
    expect(onPick).toHaveBeenCalledWith('🍎', null)
  })

  it('still shows the curated Fox tile distinctly from the recent Fox', () => {
    render(<EmojiPicker recent={['🦊']} onPick={() => {}} onCancel={() => {}} />)
    expect(screen.getByRole('button', { name: 'Fox' })).toBeInTheDocument() // curated
    expect(screen.getByRole('button', { name: 'Recently seen Fox' })).toBeInTheDocument() // recent
  })
})

describe('EmojiPicker "Other" toggle', () => {
  it('opens the extended grid, then closes it when "Other" is pressed again', async () => {
    render(<EmojiPicker recent={[]} onPick={() => {}} onCancel={() => {}} />)
    const other = screen.getByRole('button', { name: 'Other' })

    expect(screen.queryByText('Birds')).not.toBeInTheDocument()
    await userEvent.click(other)
    expect(screen.getByText('Birds')).toBeInTheDocument() // opened
    await userEvent.click(other)
    expect(screen.queryByText('Birds')).not.toBeInTheDocument() // toggled closed
  })
})

describe('EmojiPicker filter', () => {
  it('filters to matching critters by name and hides the normal sections', async () => {
    const onPick = vi.fn()
    render(<EmojiPicker recent={['🦊']} onPick={onPick} onCancel={() => {}} />)
    // normal layout is present first
    expect(screen.getByText('Recently seen')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Deer' })).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Filter critters'), 'octopus')

    expect(screen.getByRole('button', { name: 'Octopus' })).toBeInTheDocument() // extended match
    expect(screen.queryByText('Recently seen')).not.toBeInTheDocument() // sections hidden
    expect(screen.queryByRole('button', { name: 'Deer' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Octopus' }))
    expect(onPick).toHaveBeenCalledWith('🐙', 'Octopus')
  })

  it('shows a no-match message and keeps the request link', async () => {
    render(<EmojiPicker recent={[]} onPick={() => {}} onCancel={() => {}} onRequestEmoji={() => {}} />)
    await userEvent.type(screen.getByLabelText('Filter critters'), 'zzzznope')
    expect(screen.getByText(/No critters match/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Request an emoji/i })).toBeInTheDocument()
  })

  it('restores the normal layout when the filter is cleared', async () => {
    render(<EmojiPicker recent={[]} onPick={() => {}} onCancel={() => {}} />)
    const input = screen.getByLabelText('Filter critters')
    await userEvent.type(input, 'fox')
    expect(screen.queryByRole('button', { name: 'Deer' })).not.toBeInTheDocument()
    await userEvent.clear(input)
    expect(screen.getByRole('button', { name: 'Deer' })).toBeInTheDocument()
  })
})

const MR_FOX = makeProfile()

describe('EmojiPicker friends row', () => {
  it('hides the row when there are no friends', () => {
    render(<EmojiPicker recent={[]} onPick={() => {}} onCancel={() => {}} />)
    expect(screen.queryByText('Friends')).not.toBeInTheDocument()
  })

  it('renders friends above everything and fires onPickFriend with the profile', async () => {
    const onPickFriend = vi.fn()
    render(
      <EmojiPicker
        recent={['🐸']}
        friends={[MR_FOX]}
        onPickFriend={onPickFriend}
        onPick={() => {}}
        onCancel={() => {}}
      />,
    )
    expect(screen.getByText('Friends')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Friend Mr Fox' }))
    expect(onPickFriend).toHaveBeenCalledWith(MR_FOX)
  })
})
