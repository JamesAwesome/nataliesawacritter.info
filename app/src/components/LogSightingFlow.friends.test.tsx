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
})
