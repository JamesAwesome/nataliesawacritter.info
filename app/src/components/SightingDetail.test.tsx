import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api'
import { setCredentials } from '../auth'
import { makeSighting, useFakeClock } from '../test/helpers'
import { SightingDetail } from './SightingDetail'

afterEach(() => {
  localStorage.clear()
})

function renderDetail(overrides: Partial<Parameters<typeof SightingDetail>[0]> = {}) {
  const removeSighting = vi.fn(async (_id: string, _h: string) => {})
  const onDeleted = vi.fn()
  const onBack = vi.fn()
  const sighting = makeSighting({ place: 'backyard', comment: 'so fluffy', sightedTime: 'dusk' })
  render(
    <SightingDetail
      sighting={sighting}
      onBack={onBack}
      onDeleted={onDeleted}
      removeSighting={removeSighting}
      profiles={[]}
      addProfile={vi.fn(async () => {})}
      removeProfile={vi.fn(async () => {})}
      {...overrides}
    />,
  )
  return { removeSighting, onDeleted, onBack, sighting }
}

describe('SightingDetail', () => {
  useFakeClock()

  it('renders emoji, name, meta, place, and comment', () => {
    renderDetail()
    expect(screen.getByText('Fox')).toBeInTheDocument()
    expect(screen.getByText('Jul 2 · dusk')).toBeInTheDocument()
    expect(screen.getByText(/backyard/)).toBeInTheDocument()
    expect(screen.getByText('so fluffy')).toBeInTheDocument()
  })

  it('omits place and comment when null', () => {
    renderDetail({ sighting: makeSighting({ place: null, comment: null }) })
    expect(screen.queryByText(/📍/)).not.toBeInTheDocument()
  })

  it('requires two taps to delete, with the confirm state auto-reverting', async () => {
    setCredentials('sekrit')
    const { removeSighting, onDeleted, sighting } = renderDetail()
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(removeSighting).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Really delete?' })).toBeInTheDocument()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4500)
    })
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await userEvent.click(screen.getByRole('button', { name: 'Really delete?' }))
    expect(removeSighting).toHaveBeenCalledWith(sighting.id, 'Basic ' + btoa('natalie:sekrit'))
    await vi.waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1))
  })

  it('prompts for the password when no credentials, then deletes', async () => {
    const { removeSighting, onDeleted } = renderDetail()
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await userEvent.click(screen.getByRole('button', { name: 'Really delete?' }))
    expect(removeSighting).not.toHaveBeenCalled()
    await userEvent.type(screen.getByLabelText(/password/i), 'sekrit')
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await vi.waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1))
    expect(removeSighting).toHaveBeenCalledTimes(1)
  })

  it('shows the delete-specific 503 message and keeps the sighting', async () => {
    setCredentials('sekrit')
    const { onDeleted } = renderDetail({
      removeSighting: vi.fn(async () => {
        throw new ApiError(503)
      }),
    })
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await userEvent.click(screen.getByRole('button', { name: 'Really delete?' }))
    expect(await screen.findByText('Deleting is disabled right now')).toBeInTheDocument()
    expect(onDeleted).not.toHaveBeenCalled()
  })

  it('Back calls onBack', async () => {
    const { onBack } = renderDetail()
    await userEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('re-prompts for the password when delete returns 401', async () => {
    setCredentials('wrong')
    renderDetail({
      removeSighting: vi.fn(async () => {
        throw new ApiError(401)
      }),
    })
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await userEvent.click(screen.getByRole('button', { name: 'Really delete?' }))
    expect(await screen.findByLabelText(/password/i)).toBeInTheDocument()
    expect(localStorage.getItem('critter-write-auth')).toBeNull()
  })
})

describe('friend toggle', () => {
  it('saves a friend from the sighting fields', async () => {
    setCredentials('sekrit')
    const addProfile = vi.fn(async () => {})
    const { sighting } = renderDetail({ addProfile })
    await userEvent.click(screen.getByRole('button', { name: '⭐ Save as friend' }))
    await vi.waitFor(() =>
      expect(addProfile).toHaveBeenCalledWith(
        { emoji: sighting.emoji, name: sighting.name, place: sighting.place ?? undefined },
        'Basic ' + btoa('natalie:sekrit'),
      ),
    )
  })

  it('shows Remove friend when a matching profile exists and removes it', async () => {
    setCredentials('sekrit')
    const removeProfile = vi.fn(async () => {})
    const sighting = makeSighting({ emoji: '🦊', name: 'Fox' })
    const profile = {
      id: '00000000-0000-4000-8000-000000000009',
      emoji: '🦊',
      name: 'Fox',
      place: null,
      createdAt: '2026-07-04T12:00:00.000Z',
    }
    renderDetail({ sighting, profiles: [profile], removeProfile })
    expect(screen.queryByRole('button', { name: '⭐ Save as friend' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Remove friend' }))
    await vi.waitFor(() => expect(removeProfile).toHaveBeenCalledWith(profile.id, expect.any(String)))
  })

  it('matches an existing friend case- and whitespace-insensitively', () => {
    const sighting = makeSighting({ emoji: '🦊', name: 'Mr Fox' })
    const profile = {
      id: '00000000-0000-4000-8000-000000000010',
      emoji: '🦊',
      name: '  mr fox ',
      place: null,
      createdAt: '2026-07-04T12:00:00.000Z',
    }
    renderDetail({ sighting, profiles: [profile] })
    expect(screen.queryByRole('button', { name: '⭐ Save as friend' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove friend' })).toBeInTheDocument()
  })

  it('hides the toggle for nameless sightings', () => {
    renderDetail({ sighting: makeSighting({ name: null }) })
    expect(screen.queryByRole('button', { name: /friend/i })).not.toBeInTheDocument()
  })

  it('cannot open both password prompts at once', async () => {
    renderDetail()
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await userEvent.click(screen.getByRole('button', { name: 'Really delete?' }))
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '⭐ Save as friend' })).toBeDisabled()
  })

  it('prompts for the password on save-as-friend when no credentials, then saves', async () => {
    const addProfile = vi.fn(async () => {})
    renderDetail({ addProfile })
    await userEvent.click(screen.getByRole('button', { name: '⭐ Save as friend' }))
    expect(addProfile).not.toHaveBeenCalled()
    await userEvent.type(screen.getByLabelText(/password/i), 'sekrit')
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await vi.waitFor(() =>
      expect(addProfile).toHaveBeenCalledWith(expect.anything(), 'Basic ' + btoa('natalie:sekrit')),
    )
  })
})
