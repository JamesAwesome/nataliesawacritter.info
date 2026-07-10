import type { AgentResult } from './types'

/** Reads the agent's final message and extracts the last RESULT line (see
 *  buildTask). Anything unrecognized → an error result (request stays unhandled). */
export function parseResult(finalMessage: string): AgentResult {
  const lines = finalMessage.split('\n').map((l) => l.trim())
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const m = /^RESULT:\s*(pr-opened|skipped-copyright|skipped-unclear)\b\s*(\S+)?/.exec(lines[i])
    if (m === null) continue
    if (m[1] === 'pr-opened') {
      return m[2] !== undefined && /^https?:\/\//.test(m[2])
        ? { kind: 'pr-opened', prUrl: m[2] }
        : { kind: 'error', message: 'pr-opened without a valid https url' }
    }
    return m[1] === 'skipped-copyright' ? { kind: 'skipped-copyright' } : { kind: 'skipped-unclear' }
  }
  return { kind: 'error', message: 'no RESULT line in agent output' }
}
