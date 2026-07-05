// Transient network/DNS errors that mean "the database isn't reachable *yet*".
// On `docker compose up` the app can start while postgres is still coming up (or
// mid-restart), and `depends_on: service_healthy` only orders the first boot — it
// does nothing for restart-policy restarts or `restart app`. Node surfaces these as
// getaddrinfo failures (EAI_AGAIN = "try again", ENOTFOUND = name not registered yet)
// or connection refusals. They resolve on their own, so we retry rather than crash.
const TRANSIENT_CODES = new Set([
  'EAI_AGAIN',
  'ENOTFOUND',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
])

// pg errors bubble up wrapped (e.g. drizzle's DrizzleQueryError puts the real cause
// under `.cause`), so walk the whole chain. Guard against cyclic causes.
export function isTransientDbError(error: unknown): boolean {
  const seen = new Set<unknown>()
  let current = error
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    const code = (current as { code?: unknown }).code
    if (typeof code === 'string' && TRANSIENT_CODES.has(code)) return true
    current = (current as { cause?: unknown }).cause
  }
  return false
}

export interface WaitForDbOptions {
  /** Total attempts before giving up. Default 30. */
  maxAttempts?: number
  /** First backoff delay; doubles each retry. Default 500ms. */
  baseDelayMs?: number
  /** Ceiling for the backoff delay. Default 5000ms. */
  maxDelayMs?: number
  /** Called before each retry sleep (for logging). */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void
  /** Injectable sleep, for tests. */
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Runs `attempt` until it succeeds, retrying with exponential backoff on transient
 * connectivity errors. Non-transient errors (auth failures, bad SQL) throw straight
 * through — only "not reachable yet" is worth waiting on.
 */
export async function waitForDb(
  attempt: () => Promise<unknown>,
  options: WaitForDbOptions = {},
): Promise<void> {
  const maxAttempts = options.maxAttempts ?? 30
  const baseDelayMs = options.baseDelayMs ?? 500
  const maxDelayMs = options.maxDelayMs ?? 5000
  const sleep = options.sleep ?? defaultSleep

  for (let attemptNo = 1; ; attemptNo++) {
    try {
      await attempt()
      return
    } catch (error) {
      if (!isTransientDbError(error) || attemptNo >= maxAttempts) throw error
      const delayMs = Math.min(maxDelayMs, baseDelayMs * 2 ** (attemptNo - 1))
      options.onRetry?.(error, attemptNo, delayMs)
      await sleep(delayMs)
    }
  }
}
