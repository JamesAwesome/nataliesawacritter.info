import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NewSightingInput } from '../api'
import { setCredentials } from '../auth'
import { useFakeClock } from '../test/helpers'
import { LogSightingFlow } from './LogSightingFlow'

const MR_FOX = {
  id: '3f9a26cc-1c0e-4c3a-9b52-08a1c2f4d9aa',
  emoji: '🦊',
  name: 'Mr Fox',
  place: 'train station',
  createdAt: '2026-07-04T12:00:00.000Z',
}

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
    render(
      <LogSightingFlow open onClose={() => {}} onSave={vi.fn(async () => {})} onLogged={vi.fn()} onSaveFriend={vi.fn(async () => {})} />,
    )
    await userEvent.click(screen.getByRole('button', { name: /other/i }))
    await userEvent.click(screen.getByRole('button', { name: '🐝' }))
    expect(screen.getByRole('checkbox', { name: /save as a friend/i })).toBeDisabled()
    await userEvent.type(screen.getByLabelText(/critter name/i), 'Buzz')
    expect(screen.getByRole('checkbox', { name: /save as a friend/i })).toBeEnabled()
  })
})
