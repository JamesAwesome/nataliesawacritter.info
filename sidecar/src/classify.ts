import type { AgentResult, Outcome } from './types'

/** Maps an agent result to the DB outcome the app records. `error` → null,
 *  meaning "leave the request unhandled so it's retried on the next poll". */
export function outcomeOf(result: AgentResult): { outcome: Outcome; prUrl: string | null } | null {
  switch (result.kind) {
    case 'pr-opened':
      return { outcome: 'pr-opened', prUrl: result.prUrl }
    case 'skipped-copyright':
      return { outcome: 'skipped-copyright', prUrl: null }
    case 'skipped-unclear':
      return { outcome: 'skipped-unclear', prUrl: null }
    case 'error':
      return null
  }
}
