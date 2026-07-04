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
