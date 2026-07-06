import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { setCredentials } from './auth'
import { makeSighting, makeProfile, stubFetchByUrl, stubFetchQueue, stubMatchMedia, useFakeClock } from './test/helpers'

const downscalePhoto = vi.hoisted(() => vi.fn())
vi.mock('./lib/photo', () => ({ downscalePhoto }))

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
    const recent = await screen.findByTestId('recent-critters')
    expect(within(recent).getByText('Fox')).toBeInTheDocument()
  })

  it('switches to the History tab and shows the date filter + empty state', async () => {
    stubFetchQueue([{ status: 200, body: [] }])
    render(<App />)
    await userEvent.click(screen.getByRole('tab', { name: 'History' }))
    expect(screen.getByLabelText('From')).toBeInTheDocument()
    expect(within(screen.getByRole('tabpanel')).getByText(/no critters logged yet/i)).toBeInTheDocument()
  })

  it('full happy path: log a fox, toast appears, fox lands in Recent Critters', async () => {
    setCredentials('sekrit')
    const created = { ...ROW, id: '00000000-0000-4000-8000-000000000002', sightedOn: '2026-07-03' }
    stubFetchByUrl({
      '/api/sightings': [
        { status: 200, body: [] },
        { status: 201, body: created },
      ],
      '/api/profiles': [{ status: 200, body: [] }],
    })
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
    stubFetchByUrl({
      '/api/sightings': [
        { status: 200, body: [] },
        { status: 201, body: { ...ROW, sightedOn: '2026-07-03' } },
      ],
      '/api/profiles': [{ status: 200, body: [] }],
    })
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
    const banner = await waitFor(() => {
      const el = document.querySelector('.flow-error')
      if (el === null) throw new Error('banner not rendered yet')
      return el
    })
    expect(banner).toHaveTextContent(/couldn't load sightings/i)
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('renders only the sidebar RecentCritters on desktop viewports', async () => {
    stubMatchMedia(true)
    stubFetchQueue([{ status: 200, body: [ROW] }])
    render(<App />)
    const recent = await screen.findByTestId('recent-critters')
    expect(within(recent).getByText('Fox')).toBeInTheDocument()
    const instances = screen.getAllByTestId('recent-critters')
    expect(instances).toHaveLength(1)
    expect(instances[0].closest('aside')).not.toBeNull()
  })

  it('ranks sightings on the Top Critters tab', async () => {
    stubFetchQueue([
      { status: 200, body: [makeSighting({ emoji: '🦊' }), makeSighting({ emoji: '🦊' }), makeSighting({ emoji: '🦉' })] },
    ])
    render(<App />)
    await userEvent.click(screen.getByRole('tab', { name: 'Top Critters' }))
    const items = await screen.findAllByRole('listitem')
    expect(items[0]).toHaveTextContent('🦊')
    expect(items[0]).toHaveTextContent('2')
  })

  it('surfaces recently seen critters in the picker after sightings load', async () => {
    setCredentials('sekrit')
    stubFetchQueue([{ status: 200, body: [makeSighting({ emoji: '🦉', name: 'Owl' })] }])
    render(<App />)
    await userEvent.click(screen.getAllByRole('button', { name: /log a sighting/i })[0])
    expect(await screen.findByRole('button', { name: 'Recently seen Owl' })).toBeInTheDocument()
  })

  it('threads friends into the picker', async () => {
    setCredentials('sekrit')
    stubFetchByUrl({
      '/api/sightings': [{ status: 200, body: [] }],
      '/api/profiles': [
        {
          status: 200,
          body: [makeProfile()],
        },
      ],
    })
    render(<App />)
    await userEvent.click(screen.getAllByRole('button', { name: /log a sighting/i })[0])
    expect(await screen.findByRole('button', { name: 'Friend Mr Fox' })).toBeInTheDocument()
  })

  it('logging with a photo PUTs it and applies the returned row', async () => {
    setCredentials('sekrit')
    const created = makeSighting({ emoji: '🦊', name: 'Fox' })
    const withPhoto = { ...created, photoPath: `/api/photos/${created.id}-1.jpg` }
    downscalePhoto.mockResolvedValueOnce(new Blob(['x'], { type: 'image/jpeg' }))
    stubFetchByUrl({
      '/api/sightings': [
        { status: 200, body: [] },
        { status: 201, body: created },
        { status: 200, body: withPhoto }, // the PUT response
      ],
      '/api/profiles': [{ status: 200, body: [] }],
    })
    render(<App />)
    await userEvent.click(screen.getAllByRole('button', { name: /log a sighting/i })[0])
    await userEvent.click(screen.getByRole('button', { name: 'Fox' }))
    await userEvent.upload(screen.getByLabelText(/add a photo/i), new File(['p'], 'p.jpg', { type: 'image/jpeg' }))
    await screen.findByText('✓ Photo added')
    await userEvent.click(screen.getByRole('button', { name: /save sighting/i }))
    await screen.findByText('🎉 Logged!')
    // applySighting ran: opening the detail shows the served photo
    const recent = screen.getAllByTestId('recent-critters')[0]
    await userEvent.click(within(recent).getByText('Fox'))
    expect(await screen.findByRole('img')).toHaveAttribute('src', withPhoto.photoPath)
  })

  it('renders the attribution footer', () => {
    stubFetchQueue([{ status: 200, body: [] }])
    render(<App />)
    expect(screen.getByRole('link', { name: 'James Awesome' })).toHaveAttribute(
      'href',
      'https://github.com/JamesAwesome',
    )
  })
})

describe('calendar navigation and delete', () => {
  useFakeClock()

  it('calendar cell → day detail → sighting detail → back → day detail', async () => {
    const s = makeSighting({ sightedOn: '2026-07-02', name: 'Fox', sightedTime: 'dusk' })
    stubFetchQueue([{ status: 200, body: [s] }])
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: /jul 2,/i }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Jul 2')
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /fox/i }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Jul 2 · dusk')
    await userEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Jul 2')
    await userEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('recent critters row opens sighting detail; back closes (no fromDay)', async () => {
    const s = makeSighting({ name: 'Owl', emoji: '🦉', sightedOn: '2026-07-01' })
    stubFetchQueue([{ status: 200, body: [s] }])
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: /owl/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('two-tap delete removes the sighting everywhere and closes the sheet', async () => {
    setCredentials('sekrit')
    const s = makeSighting({ sightedOn: '2026-07-02', name: 'Fox' })
    stubFetchByUrl({
      '/api/sightings': [
        { status: 200, body: [s] },
        { status: 204, body: null },
      ],
      '/api/profiles': [{ status: 200, body: [] }],
    })
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: /jul 2,/i }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /fox/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await userEvent.click(screen.getByRole('button', { name: 'Really delete?' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.queryByText('Fox')).not.toBeInTheDocument()
  })

  it('stars friend sightings in Recent Critters and filters them in History', async () => {
    const fox = makeSighting({ emoji: '🦊', name: 'Mr Fox' })
    const owl = makeSighting({ emoji: '🦉', name: 'Prof Hoot' })
    stubFetchByUrl({
      '/api/sightings': [{ status: 200, body: [fox, owl] }],
      '/api/profiles': [{ status: 200, body: [makeProfile({ emoji: '🦊', name: 'Mr Fox' })] }],
    })
    render(<App />)
    const recent = screen.getAllByTestId('recent-critters')[0]
    expect(await within(recent).findByRole('button', { name: /Mr Fox.*, friend/ })).toBeInTheDocument()
    expect(within(recent).getByRole('button', { name: /Prof Hoot/ })).not.toHaveAccessibleName(/, friend/)
    await userEvent.click(screen.getByRole('tab', { name: 'History' }))
    await userEvent.click(screen.getByRole('button', { name: '⭐ Friends' }))
    const history = document.getElementById('pane-history')!
    expect(within(history).getByText('Mr Fox')).toBeInTheDocument()
    expect(within(history).queryByText('Prof Hoot')).not.toBeInTheDocument()
  })
})
