import type { Exec } from './agentRunner'

export type PrState = 'merged' | 'closed' | 'open' | 'unknown'

/** A PR's state via `gh pr view <url> --json state`. Non-zero exit or
 *  unparseable output → 'unknown' (reconcile leaves those alone). */
export async function prStateOf(exec: Exec, prUrl: string): Promise<PrState> {
  const res = await exec('gh', ['pr', 'view', prUrl, '--json', 'state'], { cwd: '.' })
  if (res.code !== 0) return 'unknown'
  try {
    const state = String((JSON.parse(res.stdout) as { state?: unknown }).state ?? '').toUpperCase()
    if (state === 'MERGED') return 'merged'
    if (state === 'CLOSED') return 'closed'
    if (state === 'OPEN') return 'open'
  } catch {
    // unparseable → unknown
  }
  return 'unknown'
}
