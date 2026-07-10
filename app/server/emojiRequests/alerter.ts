export type NtfyConfig = { url: string }

export type NtfyMessage = { title: string; tags: string; body: string }

/** Injected HTTP transport (global fetch in prod, a stub in tests). The alerter
 *  swallows rejections, so a notify can never affect the request save. */
export type NtfySend = (url: string, message: NtfyMessage) => Promise<void>

export type RequestAlerterDeps = {
  /** null → alerts disabled (no-op), same fail-open pattern as push/VAPID. */
  config: NtfyConfig | null
  send: NtfySend
}

/** Pushes a phone notification to a single secret ntfy topic when someone
 *  requests an emoji. Only whoever subscribed to that topic (the owner) is
 *  notified — separate from the friend/bell VAPID subscribers. */
export function createRequestAlerter(deps: RequestAlerterDeps) {
  return {
    /** Fire-and-forget: never throws. */
    async notify(request: { name: string; note: string | null }): Promise<void> {
      try {
        if (deps.config === null) return
        const body =
          request.note !== null && request.note !== ''
            ? `${request.name} — ${request.note}`
            : request.name
        await deps.send(deps.config.url, { title: 'New emoji request', tags: 'sparkles', body })
      } catch (err) {
        console.error('ntfy request alert failed:', err)
      }
    },
  }
}

export type RequestAlerter = ReturnType<typeof createRequestAlerter>
