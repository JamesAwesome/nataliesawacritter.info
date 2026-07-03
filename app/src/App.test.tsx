import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { setCredentials } from './auth'

const ROW = {
  id: '3f9a26cc-1c0e-4c3a-9b52-08a1c2f4d9aa', emoji: '🦊', name: 'Fox',
  sightedOn: '2026-07-02', sightedTime: null, place: null, comment: null,
  photoPath: null, createdAt: '2026-07-02T12:00:00.000Z',
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-07-03T15:00:00'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  localStorage.clear()
})

function stubFetchQueue(responses: Array<{ status: number; body: unknown }>) {
  const queue = [...responses]
  vi.stubGlobal('fetch', vi.fn(async () => {
    const next = queue.shift() ?? { status: 500, body: { error: 'internal' } }
    return new Response(JSON.stringify(next.body), { status: next.status })
  }))
}

describe('App shell', () => {
  it('renders header, three tabs, log button, and the calendar placeholder by default', async () => {
    stubFetchQueue([{ status: 200, body: [ROW] }])
    render(<App />)
    expect(screen.getByText('🐾 Natalie Saw a Critter!')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Calendar' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'History' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Top Critters' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /log a sighting/i }).length).toBeGreaterThan(0)
    expect(await screen.findByText('Fox')).toBeInTheDocument()
  })

  it('switches tabs to placeholder panes', async () => {
    stubFetchQueue([{ status: 200, body: [] }])
    render(<App />)
    await userEvent.click(screen.getByRole('tab', { name: 'History' }))
    expect(screen.getByRole('tab', { name: 'History' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument()
  })

  it('full happy path: log a fox, toast appears, fox lands in Recent Critters', async () => {
    setCredentials('sekrit')
    const created = { ...ROW, id: '00000000-0000-4000-8000-000000000002', sightedOn: '2026-07-03' }
    stubFetchQueue([
      { status: 200, body: [] },
      { status: 201, body: created },
    ])
    render(<App />)
    await userEvent.click(screen.getAllByRole('button', { name: /log a sighting/i })[0])
    await userEvent.click(screen.getByRole('button', { name: /fox/i }))
    await userEvent.click(screen.getByRole('button', { name: /save sighting/i }))
    expect(await screen.findByRole('status')).toHaveTextContent('🎉 Logged!')
    const recent = screen.getAllByTestId('recent-critters')[0]
    expect(within(recent).getByText('Fox')).toBeInTheDocument()
    // sheet closed
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('toast auto-dismisses after ~1.8s', async () => {
    setCredentials('sekrit')
    stubFetchQueue([
      { status: 200, body: [] },
      { status: 201, body: { ...ROW, sightedOn: '2026-07-03' } },
    ])
    render(<App />)
    await userEvent.click(screen.getAllByRole('button', { name: /log a sighting/i })[0])
    await userEvent.click(screen.getByRole('button', { name: /fox/i }))
    await userEvent.click(screen.getByRole('button', { name: /save sighting/i }))
    expect(await screen.findByRole('status')).toBeInTheDocument()
    await vi.advanceTimersByTimeAsync(2000)
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
  })

  it('shows a fetch-error banner with retry on non-calendar tabs', async () => {
    stubFetchQueue([{ status: 500, body: { error: 'internal' } }])
    render(<App />)
    await userEvent.click(screen.getByRole('tab', { name: 'History' }))
    expect(await screen.findByText(/couldn't load sightings/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('renders only the sidebar RecentCritters on desktop viewports', async () => {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: true,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })))
    stubFetchQueue([{ status: 200, body: [ROW] }])
    render(<App />)
    expect(await screen.findByText('Fox')).toBeInTheDocument()
    const instances = screen.getAllByTestId('recent-critters')
    expect(instances).toHaveLength(1)
    expect(instances[0].closest('aside')).not.toBeNull()
  })
})
