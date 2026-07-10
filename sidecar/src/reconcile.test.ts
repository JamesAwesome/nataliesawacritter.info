import { describe, expect, it, vi } from 'vitest'
import { reconcile, type ReconcileClient } from './reconcile'
import type { PrState } from './prState'

describe('reconcile', () => {
  it('removes merged requests and leaves the rest', async () => {
    const remove = vi.fn(async () => {})
    const client: ReconcileClient = {
      listPrOpened: vi.fn(async () => [
        { id: 'm', name: 'Deer', prUrl: 'https://x/pull/1' },
        { id: 'o', name: 'Owl', prUrl: 'https://x/pull/2' },
      ]),
      remove,
    }
    const prState = vi.fn(async (url: string): Promise<PrState> => (url.endsWith('/1') ? 'merged' : 'open'))

    const res = await reconcile({ client, prState })
    expect(remove).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledWith('m')
    expect(res.removed).toEqual(['m'])
  })

  it('removes nothing when no PR is merged', async () => {
    const remove = vi.fn(async () => {})
    const client: ReconcileClient = {
      listPrOpened: vi.fn(async () => [{ id: 'o', name: 'Owl', prUrl: 'u' }]),
      remove,
    }
    const res = await reconcile({ client, prState: vi.fn(async (): Promise<PrState> => 'closed') })
    expect(remove).not.toHaveBeenCalled()
    expect(res.removed).toEqual([])
  })
})
