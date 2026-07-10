import type { Outcome, PendingRequest } from './types'

export type RequestsClient = {
  listPending(): Promise<PendingRequest[]>
  markHandled(id: string, fields: { outcome: Outcome; prUrl: string | null }): Promise<void>
}

/** Talks to the app's owner-only /api/emoji-requests endpoints with the write
 *  credentials. `fetch` is injected so it's trivially testable. */
export function createRequestsClient(opts: {
  baseUrl: string
  authHeader: string
  fetch: typeof globalThis.fetch
}): RequestsClient {
  const { baseUrl, authHeader, fetch } = opts
  return {
    async listPending() {
      const res = await fetch(`${baseUrl}/api/emoji-requests?pending=1`, {
        headers: { authorization: authHeader },
      })
      if (!res.ok) throw new Error(`listPending failed: ${res.status}`)
      const rows = (await res.json()) as Array<{ id: string; name: string; note: string | null }>
      return rows.map((r) => ({ id: r.id, name: r.name, note: r.note }))
    },
    async markHandled(id, { outcome, prUrl }) {
      const res = await fetch(`${baseUrl}/api/emoji-requests/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', authorization: authHeader },
        body: JSON.stringify(prUrl === null ? { outcome } : { outcome, pr_url: prUrl }),
      })
      if (!res.ok) throw new Error(`markHandled failed: ${res.status}`)
    },
  }
}
