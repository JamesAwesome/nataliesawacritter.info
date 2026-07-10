/** Mirrors the app's outcome set (server/emojiRequests/outcome.ts). */
export type Outcome = 'pr-opened' | 'skipped-copyright' | 'skipped-unclear'

export type PendingRequest = { id: string; name: string; note: string | null }

/** What a single agent run produced. `error` leaves the request unhandled for retry. */
export type AgentResult =
  | { kind: 'pr-opened'; prUrl: string }
  | { kind: 'skipped-copyright' }
  | { kind: 'skipped-unclear' }
  | { kind: 'error'; message: string }

/** Runs the coding agent for one request. Injected — mocked in tests, wired to
 *  `claude -p` in phase 3. */
export type AgentRunner = (request: PendingRequest) => Promise<AgentResult>
