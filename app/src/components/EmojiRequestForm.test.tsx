import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { setCredentials } from '../auth'
import { stubFetchByUrl } from '../test/helpers'
import { EmojiRequestForm } from './EmojiRequestForm'

afterEach(() => localStorage.clear())

describe('EmojiRequestForm', () => {
  it('lists existing requests (owner-only fetch with auth)', async () => {
    setCredentials('sekrit')
    stubFetchByUrl({
      '/api/emoji-requests': [
        { status: 200, body: [{ id: 'r1', name: 'Pigeon', note: 'the city kind', createdAt: 'x' }] },
      ],
    })
    render(<EmojiRequestForm onBack={() => {}} />)
    expect(await screen.findByText('Pigeon')).toBeInTheDocument()
    expect(screen.getByText('the city kind')).toBeInTheDocument()
  })

  it('disables Send when the name is blank', async () => {
    setCredentials('sekrit')
    stubFetchByUrl({ '/api/emoji-requests': [{ status: 200, body: [] }] })
    render(<EmojiRequestForm onBack={() => {}} />)
    expect(screen.getByRole('button', { name: /send request/i })).toBeDisabled()
  })

  it('submits a request, confirms, and refreshes the list', async () => {
    setCredentials('sekrit')
    stubFetchByUrl({
      '/api/emoji-requests': [
        { status: 200, body: [] }, // initial list
        { status: 201, body: { id: 'r2', name: 'Otter', note: null, createdAt: 'x' } }, // POST
        { status: 200, body: [{ id: 'r2', name: 'Otter', note: null, createdAt: 'x' }] }, // refresh
      ],
    })
    render(<EmojiRequestForm onBack={() => {}} />)
    await userEvent.type(screen.getByLabelText(/what critter/i), 'Otter')
    await userEvent.click(screen.getByRole('button', { name: /send request/i }))
    expect(await screen.findByText(/thanks/i)).toBeInTheDocument()
    expect(await screen.findByText('Otter')).toBeInTheDocument()
  })

  it('dismisses a request', async () => {
    setCredentials('sekrit')
    stubFetchByUrl({
      '/api/emoji-requests': [
        { status: 200, body: [{ id: 'r1', name: 'Pigeon', note: null, createdAt: 'x' }] }, // list
        { status: 204, body: null }, // DELETE
      ],
    })
    render(<EmojiRequestForm onBack={() => {}} />)
    expect(await screen.findByText('Pigeon')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /dismiss pigeon/i }))
    await waitFor(() => expect(screen.queryByText('Pigeon')).not.toBeInTheDocument())
  })
})
