import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

function stubFetch(result: Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(() => result))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('App health page', () => {
  it('shows the connected state when the API reports a healthy db', async () => {
    stubFetch(
      Promise.resolve(
        new Response(JSON.stringify({ ok: true, db: true }), { status: 200 }),
      ),
    )
    render(<App />)
    expect(await screen.findByText(/database connected/i)).toBeInTheDocument()
  })

  it('shows the unavailable state when the API reports the db down', async () => {
    stubFetch(
      Promise.resolve(
        new Response(JSON.stringify({ ok: false, db: false }), { status: 503 }),
      ),
    )
    render(<App />)
    expect(await screen.findByText(/database unavailable/i)).toBeInTheDocument()
  })

  it('shows the unavailable state when the request itself fails', async () => {
    stubFetch(Promise.reject(new Error('network down')))
    render(<App />)
    expect(await screen.findByText(/database unavailable/i)).toBeInTheDocument()
  })
})
