export type Outcome = 'pr-opened' | 'skipped-copyright' | 'skipped-unclear'

/** How the sidecar resolved a request. Pinned by tests; mirrored in the client. */
export const OUTCOMES: readonly Outcome[] = ['pr-opened', 'skipped-copyright', 'skipped-unclear']

export function isOutcome(value: unknown): value is Outcome {
  return typeof value === 'string' && (OUTCOMES as readonly string[]).includes(value)
}
