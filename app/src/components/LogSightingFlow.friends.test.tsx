import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NewSightingInput } from '../api'
import { setCredentials } from '../auth'
import { useFakeClock, makeProfile, makeSighting } from '../test/helpers'
import { LogSightingFlow } from './LogSightingFlow'

const downscalePhoto = vi.hoisted(() => vi.fn())
vi.mock('../lib/photo', () => ({ downscalePhoto }))

const MR_FOX = makeProfile()

describe('LogSightingFlow friends', () => {
  useFakeClock()

  afterEach(() => {
    localStorage.clear()
  })

  it('tapping a friend prefills Step B (name + place) and one Save logs it', async () => {
    setCredentials('sekrit')
    const onSave = vi.fn(async (_f: NewSightingInput, _h: string) => {})
    const onLogged = vi.fn()
    render(
      <LogSightingFlow open onClose={() => {}} onSave={onSave} onLogged={onLogged} friends={[MR_FOX]} />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Friend Mr Fox' }))
    expect(screen.getByLabelText(/critter name/i)).toHaveValue('Mr Fox')
    expect(screen.getByLabelText(/where/i)).toHaveValue('train station')
    await userEvent.click(screen.getByRole('button', { name: /save sighting/i }))
    expect(onSave).toHaveBeenCalledWith(
      { emoji: '🦊', sightedOn: '2026-07-03', name: 'Mr Fox', place: 'train station' },
      'Basic ' + btoa('natalie:sekrit'),
    )
    expect(onLogged).toHaveBeenCalledTimes(1)
  })

  it('the save-as-friend toggle logs AND saves the friend in one flow', async () => {
    setCredentials('sekrit')
    const onSave = vi.fn(async (_f: NewSightingInput, _h: string) => {})
    const onSaveFriend = vi.fn(async () => {})
    const onLogged = vi.fn()
    render(
      <LogSightingFlow open onClose={() => {}} onSave={onSave} onLogged={onLogged} onSaveFriend={onSaveFriend} />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Fox' }))
    await userEvent.type(screen.getByLabelText(/where/i), 'garden')
    await userEvent.click(screen.getByRole('checkbox', { name: /save as a friend/i }))
    await userEvent.click(screen.getByRole('button', { name: /save sighting/i }))
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ emoji: '🦊', name: 'Fox', place: 'garden' }),
      'Basic ' + btoa('natalie:sekrit'),
    )
    await vi.waitFor(() =>
      expect(onSaveFriend).toHaveBeenCalledWith(
        { emoji: '🦊', name: 'Fox', place: 'garden' },
        'Basic ' + btoa('natalie:sekrit'),
      ),
    )
    expect(onLogged).toHaveBeenCalledTimes(1)
  })

  it('does not save a friend when the toggle is unchecked', async () => {
    setCredentials('sekrit')
    const onSaveFriend = vi.fn(async () => {})
    render(
      <LogSightingFlow open onClose={() => {}} onSave={vi.fn(async () => {})} onLogged={vi.fn()} onSaveFriend={onSaveFriend} />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Fox' }))
    await userEvent.click(screen.getByRole('button', { name: /save sighting/i }))
    expect(onSaveFriend).not.toHaveBeenCalled()
  })

  it('a failed friend save never blocks logging', async () => {
    setCredentials('sekrit')
    const onLogged = vi.fn()
    render(
      <LogSightingFlow
        open
        onClose={() => {}}
        onSave={vi.fn(async () => {})}
        onLogged={onLogged}
        onSaveFriend={vi.fn(async () => {
          throw new TypeError('network down')
        })}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Fox' }))
    await userEvent.click(screen.getByRole('checkbox', { name: /save as a friend/i }))
    await userEvent.click(screen.getByRole('button', { name: /save sighting/i }))
    await vi.waitFor(() => expect(onLogged).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(/couldn't save/i)).not.toBeInTheDocument()
  })

  it('the toggle is disabled until a name is entered', async () => {
    setCredentials('sekrit')
    render(
      <LogSightingFlow open onClose={() => {}} onSave={vi.fn(async () => {})} onLogged={vi.fn()} onSaveFriend={vi.fn(async () => {})} />,
    )
    await userEvent.click(screen.getByRole('button', { name: /other/i }))
    await userEvent.click(screen.getByRole('button', { name: '🐝' }))
    expect(screen.getByRole('checkbox', { name: /save as a friend/i })).toBeDisabled()
    await userEvent.type(screen.getByLabelText(/critter name/i), 'Buzz')
    expect(screen.getByRole('checkbox', { name: /save as a friend/i })).toBeEnabled()
  })

  it('arriving via a friend tile shows the friend status line instead of the checkbox', async () => {
    setCredentials('sekrit')
    render(
      <LogSightingFlow
        open
        onClose={() => {}}
        onSave={vi.fn(async () => {})}
        onLogged={vi.fn()}
        friends={[MR_FOX]}
        onSaveFriend={vi.fn(async () => {})}
        onRemoveFriend={vi.fn(async () => {})}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Friend Mr Fox' }))
    expect(screen.getByText(/Mr Fox is one of Natalie's friends/)).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('editing the name away swaps back to the checkbox; restoring (any case) swaps again', async () => {
    setCredentials('sekrit')
    render(
      <LogSightingFlow
        open
        onClose={() => {}}
        onSave={vi.fn(async () => {})}
        onLogged={vi.fn()}
        friends={[MR_FOX]}
        onSaveFriend={vi.fn(async () => {})}
        onRemoveFriend={vi.fn(async () => {})}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Friend Mr Fox' }))
    const nameInput = screen.getByLabelText(/critter name/i)
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, 'Mrs Fox')
    expect(screen.queryByText(/is one of Natalie's friends/)).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /save as a friend/i })).toBeEnabled()
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, 'mr fox ')
    expect(screen.getByText(/Mr Fox is one of Natalie's friends/)).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('two-tap Remove deletes the friend and the slot reverts to the checkbox', async () => {
    setCredentials('sekrit')
    const onRemoveFriend = vi.fn(async () => {})
    const props = {
      open: true,
      onClose: () => {},
      onSave: vi.fn(async () => {}),
      onLogged: vi.fn(),
      onSaveFriend: vi.fn(async () => {}),
      onRemoveFriend,
    }
    const { rerender } = render(<LogSightingFlow {...props} friends={[MR_FOX]} />)
    await userEvent.click(screen.getByRole('button', { name: 'Friend Mr Fox' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(onRemoveFriend).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Really remove?' }))
    await vi.waitFor(() =>
      expect(onRemoveFriend).toHaveBeenCalledWith(MR_FOX.id, 'Basic ' + btoa('natalie:sekrit')),
    )
    // App's profiles list updates after removal → friend drops out of `friends`.
    rerender(<LogSightingFlow {...props} friends={[]} />)
    expect(screen.queryByText(/is one of Natalie's friends/)).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /save as a friend/i })).toBeInTheDocument()
  })

  it('uploads the picked photo best-effort after the sighting saves', async () => {
    setCredentials('sekrit')
    downscalePhoto.mockResolvedValueOnce(new Blob(['x'], { type: 'image/jpeg' }))
    const created = makeSighting()
    const onSave = vi.fn(async () => created)
    const onUploadPhoto = vi.fn(async () => {})
    render(
      <LogSightingFlow open onClose={() => {}} onSave={onSave} onLogged={vi.fn()} onSaveFriend={vi.fn(async () => {})} onUploadPhoto={onUploadPhoto} />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Fox' }))
    await userEvent.upload(screen.getByLabelText(/add a photo/i), new File(['p'], 'p.jpg', { type: 'image/jpeg' }))
    await screen.findByText('✓ Photo added')
    await userEvent.click(screen.getByRole('button', { name: /save sighting/i }))
    await vi.waitFor(() =>
      expect(onUploadPhoto).toHaveBeenCalledWith(created.id, expect.any(Blob), 'Basic ' + btoa('natalie:sekrit')),
    )
  })

  it('a failed photo upload never blocks the logged toast', async () => {
    setCredentials('sekrit')
    downscalePhoto.mockResolvedValueOnce(new Blob(['x'], { type: 'image/jpeg' }))
    const onLogged = vi.fn()
    render(
      <LogSightingFlow
        open
        onClose={() => {}}
        onSave={vi.fn(async () => makeSighting())}
        onLogged={onLogged}
        onUploadPhoto={vi.fn(async () => {
          throw new Error('network down')
        })}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Fox' }))
    await userEvent.upload(screen.getByLabelText(/add a photo/i), new File(['p'], 'p.jpg', { type: 'image/jpeg' }))
    await screen.findByText('✓ Photo added')
    await userEvent.click(screen.getByRole('button', { name: /save sighting/i }))
    await vi.waitFor(() => expect(onLogged).toHaveBeenCalledTimes(1))
  })
})
