type Push = { title: string; tags: string; body: string; click: string }

/** Fire-and-forget phone pushes to the owner's secret ntfy topic (the same one
 *  the app uses for "new emoji request"). `url` undefined → disabled (no-op).
 *  Never throws — a failed push must not affect the loop. `Click` makes tapping
 *  the notification open the PR. */
export function createNotifier(deps: { url?: string; fetch: typeof globalThis.fetch; log?: (m: string) => void }) {
  async function send(p: Push): Promise<void> {
    if (!deps.url) return
    try {
      // message in the body (UTF-8), metadata in ASCII headers.
      await deps.fetch(deps.url, {
        method: 'POST',
        headers: { Title: p.title, Tags: p.tags, Click: p.click },
        body: p.body,
      })
    } catch (err) {
      deps.log?.(`ntfy "${p.title}" failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return {
    prOpened: (name: string, prUrl: string) =>
      send({ title: 'Emoji PR opened', tags: 'rocket', body: `${name} — review & merge`, click: prUrl }),
    prUpdated: (prNumber: number, prUrl: string) =>
      send({ title: 'Emoji PR updated', tags: 'recycle', body: `PR #${prNumber} updated — take a look`, click: prUrl }),
  }
}

export type Notifier = ReturnType<typeof createNotifier>
