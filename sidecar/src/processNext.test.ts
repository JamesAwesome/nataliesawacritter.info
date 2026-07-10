import { describe, expect, it, vi } from 'vitest'
import { processNext } from './processNext'
import type { RequestsClient } from './requestsClient'
import type { AgentResult, PendingRequest } from './types'

function fakeClient(pending: PendingRequest[], markHandled = vi.fn(async () => {})): RequestsClient {
  return { listPending: vi.fn(async () => pending), markHandled }
}

describe('processNext', () => {
  it('is idle when nothing is pending', async () => {
    const client = fakeClient([])
    expect(await processNext({ client, runAgent: vi.fn(), existingNames: [] })).toEqual({ status: 'idle' })
  })

  it('runs the oldest request (FIFO) and marks it handled', async () => {
    const markHandled = vi.fn(async () => {})
    // API returns newest-first, so the last element is the oldest.
    const client = fakeClient(
      [
        { id: 'new', name: 'Owl', note: null },
        { id: 'old', name: 'Pigeon', note: null },
      ],
      markHandled,
    )
    const runAgent = vi.fn(async (): Promise<AgentResult> => ({ kind: 'pr-opened', prUrl: 'https://x/pull/1' }))
    const res = await processNext({ client, runAgent, existingNames: [] })

    expect(runAgent).toHaveBeenCalledWith({ id: 'old', name: 'Pigeon', note: null })
    expect(markHandled).toHaveBeenCalledWith('old', { outcome: 'pr-opened', prUrl: 'https://x/pull/1' })
    expect(res).toEqual({ status: 'handled', id: 'old', outcome: 'pr-opened' })
  })

  it('skips a duplicate without running the agent', async () => {
    const markHandled = vi.fn(async () => {})
    const client = fakeClient([{ id: 'd', name: 'Pigeon', note: null }], markHandled)
    const runAgent = vi.fn()
    const res = await processNext({ client, runAgent, existingNames: ['pigeon'] })

    expect(runAgent).not.toHaveBeenCalled()
    expect(markHandled).toHaveBeenCalledWith('d', { outcome: 'skipped-unclear', prUrl: null })
    expect(res).toEqual({ status: 'skipped-duplicate', id: 'd' })
  })

  it('records a skip outcome from the agent', async () => {
    const markHandled = vi.fn(async () => {})
    const client = fakeClient([{ id: 'c', name: 'Pikachu', note: null }], markHandled)
    const runAgent = vi.fn(async (): Promise<AgentResult> => ({ kind: 'skipped-copyright' }))
    const res = await processNext({ client, runAgent, existingNames: [] })

    expect(markHandled).toHaveBeenCalledWith('c', { outcome: 'skipped-copyright', prUrl: null })
    expect(res).toEqual({ status: 'handled', id: 'c', outcome: 'skipped-copyright' })
  })

  it('leaves the request unhandled on an agent error (for retry)', async () => {
    const markHandled = vi.fn(async () => {})
    const client = fakeClient([{ id: 'e', name: 'Otter', note: null }], markHandled)
    const runAgent = vi.fn(async (): Promise<AgentResult> => ({ kind: 'error', message: 'timeout' }))
    const res = await processNext({ client, runAgent, existingNames: [] })

    expect(markHandled).not.toHaveBeenCalled()
    expect(res).toEqual({ status: 'error', id: 'e', message: 'timeout' })
  })
})
