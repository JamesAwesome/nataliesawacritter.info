import { describe, expect, it, vi } from 'vitest'
import { isTransientDbError, waitForDb } from './waitForDb.js'

function err(code: string, cause?: unknown) {
  return Object.assign(new Error(code), { code, cause })
}

describe('isTransientDbError', () => {
  it.each(['EAI_AGAIN', 'ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET'])(
    'treats %s as transient',
    (code) => {
      expect(isTransientDbError(err(code))).toBe(true)
    },
  )

  it('finds a transient code nested in the cause chain (DrizzleQueryError shape)', () => {
    const wrapped = Object.assign(new Error('Failed query: CREATE SCHEMA'), {
      cause: err('EAI_AGAIN'),
    })
    expect(isTransientDbError(wrapped)).toBe(true)
  })

  it('does not treat auth/other errors as transient', () => {
    expect(isTransientDbError(err('28P01'))).toBe(false)
    expect(isTransientDbError(new Error('boom'))).toBe(false)
  })

  it('is safe against cyclic cause chains', () => {
    const a: { cause?: unknown } = new Error('a')
    a.cause = a
    expect(isTransientDbError(a)).toBe(false)
  })
})

describe('waitForDb', () => {
  const noSleep = () => Promise.resolve()

  it('resolves immediately when the first attempt succeeds', async () => {
    const attempt = vi.fn().mockResolvedValue(undefined)
    await waitForDb(attempt, { sleep: noSleep })
    expect(attempt).toHaveBeenCalledTimes(1)
  })

  it('retries transient failures then succeeds', async () => {
    const attempt = vi
      .fn()
      .mockRejectedValueOnce(err('EAI_AGAIN'))
      .mockRejectedValueOnce(err('ENOTFOUND'))
      .mockResolvedValue(undefined)
    const onRetry = vi.fn()
    await waitForDb(attempt, { sleep: noSleep, onRetry })
    expect(attempt).toHaveBeenCalledTimes(3)
    expect(onRetry).toHaveBeenCalledTimes(2)
  })

  it('rethrows non-transient errors without retrying', async () => {
    const attempt = vi.fn().mockRejectedValue(err('28P01'))
    await expect(waitForDb(attempt, { sleep: noSleep })).rejects.toThrow('28P01')
    expect(attempt).toHaveBeenCalledTimes(1)
  })

  it('gives up after maxAttempts and rethrows the last transient error', async () => {
    const attempt = vi.fn().mockRejectedValue(err('EAI_AGAIN'))
    await expect(
      waitForDb(attempt, { sleep: noSleep, maxAttempts: 4 }),
    ).rejects.toThrow('EAI_AGAIN')
    expect(attempt).toHaveBeenCalledTimes(4)
  })

  it('caps backoff delay at maxDelayMs', async () => {
    const delays: number[] = []
    const attempt = vi
      .fn()
      .mockRejectedValueOnce(err('EAI_AGAIN'))
      .mockRejectedValueOnce(err('EAI_AGAIN'))
      .mockRejectedValueOnce(err('EAI_AGAIN'))
      .mockResolvedValue(undefined)
    await waitForDb(attempt, {
      sleep: (ms) => {
        delays.push(ms)
        return Promise.resolve()
      },
      baseDelayMs: 1000,
      maxDelayMs: 2500,
    })
    expect(delays).toEqual([1000, 2000, 2500])
  })
})
