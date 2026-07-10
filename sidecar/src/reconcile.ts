import type { PrState } from './prState'
import type { ResolvableRequest } from './requestsClient'

export type ReconcileClient = {
  listPrOpened(): Promise<ResolvableRequest[]>
  remove(id: string): Promise<void>
}

/** Removes requests whose PR has been merged (accepted) — closing the loop
 *  request → PR → merge → gone. Open/closed/unknown PRs are left alone. */
export async function reconcile(deps: {
  client: ReconcileClient
  prState: (prUrl: string) => Promise<PrState>
  log?: (message: string) => void
}): Promise<{ removed: string[] }> {
  const log = deps.log ?? (() => {})
  const removed: string[] = []
  for (const req of await deps.client.listPrOpened()) {
    if ((await deps.prState(req.prUrl)) === 'merged') {
      await deps.client.remove(req.id)
      removed.push(req.id)
      log(`removed merged request "${req.name}" (${req.prUrl})`)
    }
  }
  return { removed }
}
