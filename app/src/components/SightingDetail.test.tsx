import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api'
import { setCredentials } from '../auth'
import { makeSighting, useFakeClock } from '../test/helpers'
import { SightingDetail } from './SightingDetail'

const downscalePhoto = vi.hoisted(() => vi.fn())
vi.mock('../lib/photo', () => ({ downscalePhoto }))

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
      uploadPhoto={vi.fn(async () => {})}
      removePhoto={vi.fn(async () => {})}
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

  it('only ever renders a single password prompt', async () => {
    renderDetail()
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await userEvent.click(screen.getByRole('button', { name: 'Really delete?' }))
    expect(screen.getAllByLabelText(/password/i)).toHaveLength(1)
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

describe('photo block', () => {
  it('renders the img when the sighting has a photo', () => {
    renderDetail({ sighting: makeSighting({ photoPath: '/api/photos/a-1.jpg' }) })
    expect(screen.getByRole('img')).toHaveAttribute('src', '/api/photos/a-1.jpg')
    expect(screen.getByText('Replace photo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove photo' })).toBeInTheDocument()
  })

  it('adds a photo immediately from the picker when there is none', async () => {
    setCredentials('sekrit')
    downscalePhoto.mockResolvedValueOnce(new Blob(['x'], { type: 'image/jpeg' }))
    const uploadPhoto = vi.fn(async () => {})
    const { sighting } = renderDetail({ uploadPhoto })
    await userEvent.upload(screen.getByLabelText(/add a photo/i), new File(['p'], 'p.jpg', { type: 'image/jpeg' }))
    await vi.waitFor(() =>
      expect(uploadPhoto).toHaveBeenCalledWith(sighting.id, expect.any(Blob), 'Basic ' + btoa('natalie:sekrit')),
    )
  })

  it('removes with the two-tap confirm', async () => {
    setCredentials('sekrit')
    const removePhoto = vi.fn(async () => {})
    const sighting = makeSighting({ photoPath: '/api/photos/a-1.jpg' })
    renderDetail({ sighting, removePhoto })
    await userEvent.click(screen.getByRole('button', { name: 'Remove photo' }))
    expect(removePhoto).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Really remove?' }))
    await vi.waitFor(() => expect(removePhoto).toHaveBeenCalledWith(sighting.id, expect.any(String)))
  })

  it('replaces via the picker', async () => {
    setCredentials('sekrit')
    downscalePhoto.mockResolvedValueOnce(new Blob(['y'], { type: 'image/jpeg' }))
    const uploadPhoto = vi.fn(async () => {})
    const sighting = makeSighting({ photoPath: '/api/photos/a-1.jpg' })
    renderDetail({ sighting, uploadPhoto })
    await userEvent.upload(screen.getByLabelText('Replace photo'), new File(['q'], 'q.jpg', { type: 'image/jpeg' }))
    await vi.waitFor(() => expect(uploadPhoto).toHaveBeenCalledWith(sighting.id, expect.any(Blob), expect.any(String)))
  })

  it('resets the replace-photo input so re-picking the same file after a failure retries', async () => {
    setCredentials('sekrit')
    downscalePhoto.mockRejectedValueOnce(new Error('bad photo')).mockResolvedValueOnce(new Blob(['z'], { type: 'image/jpeg' }))
    const uploadPhoto = vi.fn(async () => {})
    const sighting = makeSighting({ photoPath: '/api/photos/a-1.jpg' })
    renderDetail({ sighting, uploadPhoto })
    const file = new File(['q'], 'q.jpg', { type: 'image/jpeg' })
    await userEvent.upload(screen.getByLabelText('Replace photo'), file)
    expect(await screen.findByText("Couldn't read that photo")).toBeInTheDocument()
    expect(uploadPhoto).not.toHaveBeenCalled()
    await userEvent.upload(screen.getByLabelText('Replace photo'), file)
    await vi.waitFor(() =>
      expect(uploadPhoto).toHaveBeenCalledWith(sighting.id, expect.any(Blob), expect.any(String)),
    )
  })

  it('the replace input is visually hidden, not display:none', () => {
    renderDetail({ sighting: makeSighting({ photoPath: '/api/photos/a-1.jpg' }) })
    expect(screen.getByLabelText('Replace photo')).toHaveClass('visually-hidden-input')
  })
})
