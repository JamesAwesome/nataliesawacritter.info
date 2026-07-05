import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { stubFetchQueue } from '../test/helpers'
import { NotifyBell } from './NotifyBell'

const REAL_UA = navigator.userAgent

type FakeSubscription = {
  endpoint: string
  toJSON: () => { endpoint: string; keys: { p256dh: string; auth: string } }
  unsubscribe: ReturnType<typeof vi.fn>
}

function fakeSubscription(endpoint = 'https://push.example.com/browser-sub'): FakeSubscription {
  return {
    endpoint,
    toJSON: () => ({ endpoint, keys: { p256dh: 'pk', auth: 'ak' } }),
    unsubscribe: vi.fn(async () => true),
  }
}

function mockPushEnv(opts: { permission?: NotificationPermission; existing?: FakeSubscription | null } = {}) {
  const subscription = fakeSubscription()
  const registration = {
    pushManager: {
      getSubscription: vi.fn(async () => opts.existing ?? null),
      subscribe: vi.fn(async () => subscription),
    },
  }
  Object.defineProperty(window.navigator, 'serviceWorker', {
    value: { ready: Promise.resolve(registration) },
    configurable: true,
  })
  vi.stubGlobal('PushManager', function PushManager() {})
  vi.stubGlobal('Notification', {
    permission: opts.permission ?? 'default',
    requestPermission: vi.fn(async () => 'granted' as NotificationPermission),
  })
  return { registration, subscription }
}

function setUserAgent(value: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value, configurable: true })
}

afterEach(() => {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(window.navigator, 'serviceWorker')
  setUserAgent(REAL_UA)
})

describe('NotifyBell', () => {
  it('renders nothing when push is unsupported', () => {
    render(<NotifyBell />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('subscribes on tap: permission → browser subscribe → POST → Alerts on', async () => {
    const { registration } = mockPushEnv()
    const mock = stubFetchQueue([
      { status: 200, body: { key: 'BAUG' } },
      { status: 201, body: { ok: true } },
    ])
    render(<NotifyBell />)
    await userEvent.click(await screen.findByRole('button', { name: 'Get notified' }))
    await screen.findByRole('button', { name: 'Alerts on' })
    expect(registration.pushManager.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true }),
    )
    expect(mock).toHaveBeenLastCalledWith(
      '/api/push/subscriptions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          endpoint: 'https://push.example.com/browser-sub',
          keys: { p256dh: 'pk', auth: 'ak' },
        }),
      }),
    )
  })

  it('rolls back the browser subscription when the server POST fails', async () => {
    const { subscription } = mockPushEnv()
    stubFetchQueue([
      { status: 200, body: { key: 'BAUG' } },
      { status: 500, body: { error: 'internal' } },
    ])
    render(<NotifyBell />)
    await userEvent.click(await screen.findByRole('button', { name: 'Get notified' }))
    await screen.findByText("Couldn't turn on notifications — try again")
    expect(subscription.unsubscribe).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Get notified' })).toBeInTheDocument()
  })

  it('starts as Alerts on with an existing subscription, and unsubscribes on tap', async () => {
    const existing = fakeSubscription()
    mockPushEnv({ existing })
    const mock = stubFetchQueue([{ status: 204, body: null }])
    render(<NotifyBell />)
    await userEvent.click(await screen.findByRole('button', { name: 'Alerts on' }))
    await screen.findByRole('button', { name: 'Get notified' })
    expect(existing.unsubscribe).toHaveBeenCalled()
    expect(mock).toHaveBeenCalledWith('/api/push/subscriptions', expect.objectContaining({ method: 'DELETE' }))
  })

  it('shows the blocked note when permission is denied', async () => {
    mockPushEnv({ permission: 'denied' })
    render(<NotifyBell />)
    await userEvent.click(await screen.findByRole('button', { name: 'Get notified' }))
    expect(
      screen.getByText('Notifications are blocked for this site in your browser settings.'),
    ).toBeInTheDocument()
  })

  it('opens the Add to Home Screen sheet on iPhone Safari without push', async () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15')
    render(<NotifyBell />)
    await userEvent.click(await screen.findByRole('button', { name: 'Get notified' }))
    expect(screen.getByText('Get critter alerts 🔔')).toBeInTheDocument()
    expect(screen.getByText('Choose “Add to Home Screen”')).toBeInTheDocument()
  })

  it('hides itself when the server reports push disabled', async () => {
    mockPushEnv()
    stubFetchQueue([{ status: 503, body: { error: 'push disabled' } }])
    render(<NotifyBell />)
    await userEvent.click(await screen.findByRole('button', { name: 'Get notified' }))
    await waitFor(() => expect(screen.queryByRole('button')).toBeNull())
  })
})
