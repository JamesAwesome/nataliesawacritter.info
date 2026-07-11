/** Fire-and-forget phone push to the owner's secret ntfy topic (the same one the
 *  app uses for "new emoji request") when the sidecar opens a PR. `url` undefined
 *  → disabled (no-op). Never throws — a failed push must not affect the loop. */
export function createNotifier(deps: { url?: string; fetch: typeof globalThis.fetch; log?: (m: string) => void }) {
  return {
    async prOpened(name: string, prUrl: string): Promise<void> {
      if (!deps.url) return
      try {
        // ntfy: message in the body (UTF-8), metadata in ASCII headers. `Click`
        // makes tapping the notification open the PR.
        await deps.fetch(deps.url, {
          method: 'POST',
          headers: { Title: 'Emoji PR opened', Tags: 'rocket', Click: prUrl },
          body: `${name} — review & merge`,
        })
      } catch (err) {
        deps.log?.(`ntfy prOpened failed: ${err instanceof Error ? err.message : String(err)}`)
      }
    },
  }
}

export type Notifier = ReturnType<typeof createNotifier>
