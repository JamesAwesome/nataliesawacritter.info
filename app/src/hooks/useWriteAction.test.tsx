import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api'
import { getCredentials, setCredentials } from '../auth'
import { useWriteAction } from './useWriteAction'

const MSG = { disabled: 'disabled msg', failed: 'failed msg' }

afterEach(() => {
  localStorage.clear()
})

describe('useWriteAction', () => {
  it('runs the action with the stored header and fires onSuccess', async () => {
    setCredentials('sekrit')
    const action = vi.fn(async (_h: string) => {})
    const onSuccess = vi.fn()
    const { result } = renderHook(() => useWriteAction(MSG))
    act(() => result.current.run(action, onSuccess))
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
    expect(action).toHaveBeenCalledWith('Basic ' + btoa('natalie:sekrit'))
    expect(result.current.busy).toBe(false)
  })

  it('opens the prompt when no credentials are stored, then runs on submit', async () => {
    const action = vi.fn(async () => {})
    const onSuccess = vi.fn()
    const { result } = renderHook(() => useWriteAction(MSG))
    act(() => result.current.run(action, onSuccess))
    expect(result.current.prompt.open).toBe(true)
    expect(action).not.toHaveBeenCalled()
    act(() => result.current.prompt.onSubmit('sekrit'))
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
    expect(localStorage.getItem('critter-write-auth')).not.toBeNull()
  })

  it('keeps a prompt-submitted password after a non-401 failure', async () => {
    const action = vi.fn(async () => {
      throw new ApiError(503)
    })
    const { result } = renderHook(() => useWriteAction(MSG))
    act(() => result.current.run(action, vi.fn()))
    expect(result.current.prompt.open).toBe(true)
    act(() => result.current.prompt.onSubmit('sekrit'))
    await waitFor(() => expect(result.current.actionError).toBe('disabled msg'))
    // 503 (unlike 401) must not discard the password the user just typed.
    expect(getCredentials()).toEqual({ user: 'natalie', password: 'sekrit' })
  })

  it('401 clears credentials and re-prompts with the error', async () => {
    setCredentials('wrong')
    const action = vi.fn(async () => {
      throw new ApiError(401)
    })
    const { result } = renderHook(() => useWriteAction(MSG))
    act(() => result.current.run(action, vi.fn()))
    await waitFor(() => expect(result.current.prompt.open).toBe(true))
    expect(result.current.prompt.error).toBe('Wrong password — try again')
    expect(localStorage.getItem('critter-write-auth')).toBeNull()
  })

  it('maps 503 and generic failures to the configured messages', async () => {
    setCredentials('sekrit')
    const { result } = renderHook(() => useWriteAction(MSG))
    act(() => result.current.run(async () => { throw new ApiError(503) }, vi.fn()))
    await waitFor(() => expect(result.current.actionError).toBe('disabled msg'))
    act(() => result.current.run(async () => { throw new TypeError('net') }, vi.fn()))
    await waitFor(() => expect(result.current.actionError).toBe('failed msg'))
  })

  it('abandon() suppresses a late success continuation', async () => {
    setCredentials('sekrit')
    let resolveAction!: () => void
    const onSuccess = vi.fn()
    const { result } = renderHook(() => useWriteAction(MSG))
    act(() => result.current.run(() => new Promise((res) => { resolveAction = res }), onSuccess))
    act(() => result.current.abandon())
    resolveAction()
    await act(async () => {})
    expect(onSuccess).not.toHaveBeenCalled()
    expect(result.current.actionError).toBeNull()
  })

  it('uses per-run message overrides for error mapping', async () => {
    setCredentials('sekrit')
    const { result } = renderHook(() =>
      useWriteAction({ disabled: 'default disabled', failed: 'default failed' }),
    )
    await act(() =>
      result.current.run(
        async () => {
          throw new ApiError(503)
        },
        () => {},
        { disabled: 'photos disabled' },
      ),
    )
    await waitFor(() => expect(result.current.actionError).toBe('photos disabled'))

    await act(() =>
      result.current.run(
        async () => {
          throw new Error('boom')
        },
        () => {},
      ),
    )
    await waitFor(() => expect(result.current.actionError).toBe('default failed'))
  })
})
