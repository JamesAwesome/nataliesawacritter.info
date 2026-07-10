/** What one iterate run produced. `error` means the run failed (no RESULT line
 *  or non-zero exit); the comment is already ack'd so it won't auto-retry. */
export type IterateResult =
  | { kind: 'updated' }
  | { kind: 'refused'; reason: string }
  | { kind: 'error'; message: string }

/** Reads the agent's final message and extracts the last RESULT line (see
 *  buildIterateTask). Anything unrecognized → an error result. */
export function parseIterateResult(finalMessage: string): IterateResult {
  const lines = finalMessage.split('\n').map((l) => l.trim())
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const m = /^RESULT:\s*(updated|refused)\b\s*(.*)$/.exec(lines[i])
    if (m === null) continue
    if (m[1] === 'updated') return { kind: 'updated' }
    return { kind: 'refused', reason: m[2].trim() || 'no reason given' }
  }
  return { kind: 'error', message: 'no RESULT line in agent output' }
}
