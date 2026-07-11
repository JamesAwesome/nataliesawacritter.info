import { outcomeOf } from './classify'
import { isDuplicate } from './dedupe'
import type { RequestsClient } from './requestsClient'
import type { AgentRunner, Outcome } from './types'

export type ProcessDeps = {
  client: RequestsClient
  runAgent: AgentRunner
  /** Names of critters that already exist, for dedupe. */
  existingNames: readonly string[]
  log?: (message: string) => void
  /** Fire-and-forget push when a request results in an opened PR. */
  notifyPrOpened?: (name: string, prUrl: string) => void | Promise<void>
}

export type ProcessResult =
  | { status: 'idle' }
  | { status: 'handled'; id: string; outcome: Outcome }
  | { status: 'skipped-duplicate'; id: string }
  | { status: 'error'; id: string; message: string }

/** Handles the single oldest pending request (FIFO), if any. One step of the
 *  loop — the caller schedules/repeats it. Pure orchestration over injected
 *  deps, so it's fully testable without spending tokens. */
export async function processNext(deps: ProcessDeps): Promise<ProcessResult> {
  const log = deps.log ?? (() => {})
  const pending = await deps.client.listPending()
  if (pending.length === 0) return { status: 'idle' }

  // The API returns newest-first; take the oldest so requests drain in order.
  const request = pending[pending.length - 1]!
  log(`processing "${request.name}" (${request.id})`)

  if (isDuplicate(request.name, deps.existingNames)) {
    await deps.client.markHandled(request.id, { outcome: 'skipped-unclear', prUrl: null })
    log(`skipped duplicate "${request.name}"`)
    return { status: 'skipped-duplicate', id: request.id }
  }

  const result = await deps.runAgent(request)
  const classified = outcomeOf(result)
  if (classified === null) {
    // Agent errored → leave unhandled so the next poll retries it.
    const message = result.kind === 'error' ? result.message : 'agent error'
    log(`error on "${request.name}": ${message}`)
    return { status: 'error', id: request.id, message }
  }

  await deps.client.markHandled(request.id, classified)
  log(`handled "${request.name}" → ${classified.outcome}`)
  if (classified.outcome === 'pr-opened' && classified.prUrl !== null) {
    await deps.notifyPrOpened?.(request.name, classified.prUrl)
  }
  return { status: 'handled', id: request.id, outcome: classified.outcome }
}
