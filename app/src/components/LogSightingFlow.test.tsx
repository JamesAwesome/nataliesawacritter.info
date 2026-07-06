import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NewSightingInput } from '../api'
import { ApiError } from '../api'
import { getCredentials, setCredentials } from '../auth'
import { stubFetchQueue, useFakeClock } from '../test/helpers'
import { LogSightingFlow } from './LogSightingFlow'

afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
})

function renderFlow(
  overrides: Partial<Parameters<typeof LogSightingFlow>[0]> = {},
  opts: { credentials?: boolean } = {},
) {
  if (opts.credentials !== false) setCredentials('sekrit')
  const onSave = overrides.onSave ?? vi.fn(async (_f: NewSightingInput, _h: string) => {})
  const onLogged = overrides.onLogged ?? vi.fn()
  const onClose = overrides.onClose ?? vi.fn()
  render(
    <LogSightingFlow open onClose={onClose} onSave={onSave} onLogged={onLogged} {...overrides} />,
  )
  return { onSave, onLogged, onClose }
}

describe('LogSightingFlow', () => {
  useFakeClock()

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

  it('closing the sheet during an in-flight save (late success) does not fire onLogged', async () => {
    setCredentials('sekrit')
    let resolveSave: () => void = () => {}
    const onSave = vi.fn(
      () =>
        new Promise<void>((res) => {
          resolveSave = res
        }),
    )
    const { onLogged } = renderFlow({ onSave })
    await userEvent.click(screen.getByRole('button', { name: /fox/i }))
    await userEvent.click(screen.getByRole('button', { name: /save sighting/i }))
    expect(onSave).toHaveBeenCalledTimes(1)

    // abandon the in-flight save by closing the sheet
    fireEvent.keyDown(window, { key: 'Escape' })

    resolveSave()
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))

    expect(onLogged).not.toHaveBeenCalled()
    // back on the picker after the abandoned close
    expect(screen.getByText('What did Natalie see?')).toBeInTheDocument()
  })

  it('closing the sheet during an in-flight save (late 401) leaves no stale prompt or error', async () => {
    setCredentials('sekrit')
    let rejectSave: (err: unknown) => void = () => {}
    const onSave = vi.fn(
      () =>
        new Promise<void>((_res, rej) => {
          rejectSave = rej
        }),
    )
    renderFlow({ onSave })
    await userEvent.click(screen.getByRole('button', { name: /fox/i }))
    await userEvent.click(screen.getByRole('button', { name: /save sighting/i }))
    expect(onSave).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(window, { key: 'Escape' })

    rejectSave(new ApiError(401))
    await Promise.resolve()
    await Promise.resolve()

    // re-pick after the abandoned close — no stale prompt/error should surface
    await userEvent.click(screen.getByRole('button', { name: /fox/i }))
    expect(screen.queryByText(/wrong password/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument()
  })

  it('disables Save and blocks submission when the date is cleared', async () => {
    const { onSave } = renderFlow()
    await userEvent.click(screen.getByRole('button', { name: /fox/i }))
    const dateInput = screen.getByLabelText(/date/i)
    fireEvent.change(dateInput, { target: { value: '' } })
    expect(screen.getByRole('button', { name: /save sighting/i })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: /save sighting/i }))
    expect(onSave).not.toHaveBeenCalled()
  })

  it('folds custom birds into Other → Birds; picking Robin advances with the name pre-filled', async () => {
    renderFlow()
    // Custom birds live in the categorized "Other" grid now, not a top-level section.
    expect(screen.queryByRole('button', { name: 'Robin' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /other/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Robin' }))
    expect(screen.getByLabelText(/critter name/i)).toHaveValue('Robin')
  })
})

describe('entry auth gate', () => {
  it('shows the magic-word prompt instead of the picker when no password is saved', () => {
    renderFlow({}, { credentials: false })
    expect(screen.getByText("Natalie, what's the magic word?")).toBeInTheDocument()
    expect(screen.queryByText('What did Natalie see?')).not.toBeInTheDocument()
  })

  it('verifies, stores the password, and reveals the picker on success', async () => {
    const mock = stubFetchQueue([{ status: 204, body: null }])
    renderFlow({}, { credentials: false })
    await userEvent.type(screen.getByLabelText(/password/i), 'sekrit')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('What did Natalie see?')).toBeInTheDocument()
    expect(getCredentials()).toEqual({ user: 'natalie', password: 'sekrit' })
    expect(mock).toHaveBeenCalledWith('/api/auth/check', {
      headers: { authorization: expect.stringMatching(/^Basic /) },
    })
  })

  it('shows the wrong-password error on 401 and stays locked', async () => {
    stubFetchQueue([{ status: 401, body: { error: 'unauthorized' } }])
    renderFlow({}, { credentials: false })
    await userEvent.type(screen.getByLabelText(/password/i), 'nope')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Wrong password — try again')).toBeInTheDocument()
    expect(screen.queryByText('What did Natalie see?')).not.toBeInTheDocument()
    expect(getCredentials()).toBeNull()
  })

  it('shows the disabled line on 503', async () => {
    stubFetchQueue([{ status: 503, body: { error: 'writes disabled' } }])
    renderFlow({}, { credentials: false })
    await userEvent.type(screen.getByLabelText(/password/i), 'sekrit')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Logging is disabled right now')).toBeInTheDocument()
    expect(screen.queryByText("Natalie, what's the magic word?")).not.toBeInTheDocument()
  })

  it('shows the check-failed copy on other errors', async () => {
    stubFetchQueue([{ status: 500, body: { error: 'internal' } }])
    renderFlow({}, { credentials: false })
    await userEvent.type(screen.getByLabelText(/password/i), 'sekrit')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText("Couldn't check the password — try again")).toBeInTheDocument()
  })

  it('cancel closes the sheet', async () => {
    const { onClose } = renderFlow({}, { credentials: false })
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('opens straight to the picker with stored credentials and no network', () => {
    const mock = stubFetchQueue([])
    renderFlow()
    expect(screen.getByText('What did Natalie see?')).toBeInTheDocument()
    expect(mock).not.toHaveBeenCalled()
  })

  it('ignores a check that resolves after cancel (no silent credential store)', async () => {
    let resolveCheck!: (res: Response) => void
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((res) => { resolveCheck = res })),
    )
    renderFlow({}, { credentials: false })
    await userEvent.type(screen.getByLabelText(/password/i), 'sekrit')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    // The check comes back valid, but the user already cancelled — a late 204
    // must not store credentials or unlock behind their back.
    await act(async () => {
      resolveCheck(new Response(null, { status: 204 }))
    })
    expect(getCredentials()).toBeNull()
  })
})
