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

  it('shows a PR link for a handled request, a skipped tag for a skip, nothing for pending', async () => {
    setCredentials('sekrit')
    stubFetchByUrl({
      '/api/emoji-requests': [
        {
          status: 200,
          body: [
            { id: 'a', name: 'Pigeon', note: null, createdAt: 'x', handledAt: 'y', prUrl: 'https://github.com/o/r/pull/9', outcome: 'pr-opened' },
            { id: 'b', name: 'Dodo', note: null, createdAt: 'x', handledAt: 'y', prUrl: null, outcome: 'skipped-copyright' },
            { id: 'c', name: 'Fox', note: null, createdAt: 'x', handledAt: null, prUrl: null, outcome: null },
          ],
        },
      ],
    })
    render(<EmojiRequestForm onBack={() => {}} />)
    const pr = await screen.findByRole('link', { name: /PR/ })
    expect(pr).toHaveAttribute('href', 'https://github.com/o/r/pull/9')
    expect(screen.getByText('skipped')).toBeInTheDocument()
    // exactly one PR link + one skipped tag (the pending Fox row has neither)
    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(screen.getAllByText('skipped')).toHaveLength(1)
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
