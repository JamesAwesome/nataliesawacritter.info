import { afterEach, describe, expect, it, vi } from 'vitest'
import { needsIosInstall, pushSupported, urlBase64ToUint8Array, withTimeout } from './push'

const REAL_UA = navigator.userAgent

function setUserAgent(value: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value, configurable: true })
}

afterEach(() => {
  setUserAgent(REAL_UA)
  vi.unstubAllGlobals()
})

describe('urlBase64ToUint8Array', () => {
  it('decodes plain base64', () => {
    expect(Array.from(urlBase64ToUint8Array('BAUG'))).toEqual([4, 5, 6])
  })

  it('decodes base64url characters and re-pads', () => {
    // bytes [255, 254] encode as '//4=' in base64 → '__4' unpadded base64url
    expect(Array.from(urlBase64ToUint8Array('__4'))).toEqual([255, 254])
  })
})

describe('needsIosInstall', () => {
  it('is true on iPhone Safari without PushManager', () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15')
    expect(needsIosInstall()).toBe(true)
  })

  it('is false once PushManager exists (installed PWA) and on non-iOS browsers', () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15')
    vi.stubGlobal('PushManager', function PushManager() {})
    expect(needsIosInstall()).toBe(false)
    vi.unstubAllGlobals()
    setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')
    expect(needsIosInstall()).toBe(false)
  })
})

describe('pushSupported', () => {
  it('is false in a bare jsdom environment', () => {
    expect(pushSupported()).toBe(false)
  })
})

describe('withTimeout', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves with the inner value when it settles in time', async () => {
    vi.useFakeTimers()
    await expect(withTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok')
  })

  it('rejects with the inner error when it fails in time', async () => {
    vi.useFakeTimers()
    await expect(withTimeout(Promise.reject(new Error('boom')), 1000)).rejects.toThrow('boom')
  })

  it('rejects when the inner promise never settles', async () => {
    vi.useFakeTimers()
    const result = withTimeout(new Promise(() => {}), 1000)
    const assertion = expect(result).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(1000)
    await assertion
  })
})
