import { afterEach, describe, expect, it, vi } from 'vitest'
import { tapFeedback } from './haptics'

afterEach(() => {
  vi.unstubAllGlobals()
  delete (navigator as { vibrate?: unknown }).vibrate
})

describe('tapFeedback', () => {
  it('fires a short vibration when the Vibration API is available (Android)', () => {
    const vibrate = vi.fn()
    ;(navigator as { vibrate?: unknown }).vibrate = vibrate
    tapFeedback()
    expect(vibrate).toHaveBeenCalledWith(15)
  })

  it('is a no-op when the Vibration API is absent (iOS/unsupported)', () => {
    delete (navigator as { vibrate?: unknown }).vibrate
    expect(() => tapFeedback()).not.toThrow()
  })
})
