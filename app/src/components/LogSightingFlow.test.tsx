import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NewSightingInput } from '../api'
import { ApiError } from '../api'
import { setCredentials } from '../auth'
import { LogSightingFlow } from './LogSightingFlow'

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-07-03T15:00:00'))
})

afterEach(() => {
  vi.useRealTimers()
  localStorage.clear()
})

function renderFlow(overrides: Partial<Parameters<typeof LogSightingFlow>[0]> = {}) {
  const onSave = overrides.onSave ?? vi.fn(async (_f: NewSightingInput, _h: string) => {})
  const onLogged = overrides.onLogged ?? vi.fn()
  const onClose = overrides.onClose ?? vi.fn()
  render(
    <LogSightingFlow open onClose={onClose} onSave={onSave} onLogged={onLogged} {...overrides} />,
  )
  return { onSave, onLogged, onClose }
}

describe('LogSightingFlow', () => {
  it('starts on the picker with the heading and 12 curated tiles + Other', () => {
    renderFlow()
    expect(screen.getByText('What did Natalie see?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /deer/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /duck/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /other/i })).toBeInTheDocument()
  })

  it('Other expands the extended grid inline', async () => {
    renderFlow()
    expect(screen.queryByRole('button', { name: '🐝' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /other/i }))
    expect(screen.getByRole('button', { name: '🐝' })).toBeInTheDocument()
    // still on the picker step
    expect(screen.getByText('What did Natalie see?')).toBeInTheDocument()
  })

  it('picking a curated critter advances to details with the name pre-filled and today as date', async () => {
    renderFlow()
    await userEvent.click(screen.getByRole('button', { name: /fox/i }))
    expect(screen.getByLabelText(/critter name/i)).toHaveValue('Fox')
    expect(screen.getByLabelText(/date/i)).toHaveValue('2026-07-03')
  })

  it('picking an extended emoji leaves the name blank', async () => {
    renderFlow()
    await userEvent.click(screen.getByRole('button', { name: /other/i }))
    await userEvent.click(screen.getByRole('button', { name: '🐝' }))
    expect(screen.getByLabelText(/critter name/i)).toHaveValue('')
  })

  it('Back returns to the picker', async () => {
    renderFlow()
    await userEvent.click(screen.getByRole('button', { name: /fox/i }))
    await userEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(screen.getByText('What did Natalie see?')).toBeInTheDocument()
  })

  it('saves with stored credentials: builds fields, calls onSave with header, fires onLogged', async () => {
    setCredentials('sekrit')
    const { onSave, onLogged } = renderFlow()
    await userEvent.click(screen.getByRole('button', { name: /fox/i }))
    await userEvent.type(screen.getByLabelText(/where/i), 'backyard')
    await userEvent.click(screen.getByRole('button', { name: /save sighting/i }))
    expect(onSave).toHaveBeenCalledWith(
      { emoji: '🦊', sightedOn: '2026-07-03', name: 'Fox', place: 'backyard' },
      'Basic ' + btoa('natalie:sekrit'),
    )
    expect(onLogged).toHaveBeenCalledTimes(1)
  })

  it('prompts for the password when no credentials are stored, then saves', async () => {
    const { onSave, onLogged } = renderFlow()
    await userEvent.click(screen.getByRole('button', { name: /fox/i }))
    await userEvent.click(screen.getByRole('button', { name: /save sighting/i }))
    expect(onSave).not.toHaveBeenCalled()
    await userEvent.type(screen.getByLabelText(/password/i), 'sekrit')
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(onSave).toHaveBeenCalledWith(expect.anything(), 'Basic ' + btoa('natalie:sekrit'))
    expect(onLogged).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('critter-write-auth')).not.toBeNull()
  })

  it('401 clears credentials and re-prompts with an error note, draft intact', async () => {
    setCredentials('wrong')
    const { onSave, onLogged } = renderFlow({
      onSave: vi.fn(async () => {
        throw new ApiError(401)
      }),
    })
    await userEvent.click(screen.getByRole('button', { name: /fox/i }))
    await userEvent.type(screen.getByLabelText(/where/i), 'trail')
    await userEvent.click(screen.getByRole('button', { name: /save sighting/i }))
    expect(await screen.findByText(/wrong password/i)).toBeInTheDocument()
    expect(localStorage.getItem('critter-write-auth')).toBeNull()
    expect(onLogged).not.toHaveBeenCalled()
    // draft intact behind the prompt
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.getByLabelText(/where/i)).toHaveValue('trail')
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('503 shows the writes-disabled message and keeps the sheet open', async () => {
    setCredentials('sekrit')
    const { onLogged, onClose } = renderFlow({
      onSave: vi.fn(async () => {
        throw new ApiError(503)
      }),
    })
    await userEvent.click(screen.getByRole('button', { name: /fox/i }))
    await userEvent.click(screen.getByRole('button', { name: /save sighting/i }))
    expect(await screen.findByText(/saving is disabled right now/i)).toBeInTheDocument()
    expect(onLogged).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('network failure shows a generic error and preserves the draft', async () => {
    setCredentials('sekrit')
    renderFlow({
      onSave: vi.fn(async () => {
        throw new TypeError('fetch failed')
      }),
    })
    await userEvent.click(screen.getByRole('button', { name: /fox/i }))
    await userEvent.type(screen.getByLabelText(/comment/i), 'so fluffy')
    await userEvent.click(screen.getByRole('button', { name: /save sighting/i }))
    expect(await screen.findByText(/couldn't save — try again/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/comment/i)).toHaveValue('so fluffy')
  })

  it('omits empty optional fields from the save payload', async () => {
    setCredentials('sekrit')
    const { onSave } = renderFlow()
    await userEvent.click(screen.getByRole('button', { name: /other/i }))
    await userEvent.click(screen.getByRole('button', { name: '🐝' }))
    await userEvent.click(screen.getByRole('button', { name: /save sighting/i }))
    expect(onSave).toHaveBeenCalledWith(
      { emoji: '🐝', sightedOn: '2026-07-03' },
      expect.any(String),
    )
  })
})
