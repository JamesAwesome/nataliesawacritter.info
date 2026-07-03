import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { setCredentials } from './auth'
import { makeSighting, stubFetchQueue, stubMatchMedia, useFakeClock } from './test/helpers'

const ROW = makeSighting()

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('App shell', () => {
  useFakeClock()

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
    stubMatchMedia(true)
    stubFetchQueue([{ status: 200, body: [ROW] }])
    render(<App />)
    expect(await screen.findByText('Fox')).toBeInTheDocument()
    const instances = screen.getAllByTestId('recent-critters')
    expect(instances).toHaveLength(1)
    expect(instances[0].closest('aside')).not.toBeNull()
  })
})
