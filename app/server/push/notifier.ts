import type { Sighting } from '../sightings/store.js'
import type { PushStore } from './store.js'
import { standInFor } from '../customEmoji.js'
import { quantityTextSuffix } from '../quantity.js'

export type VapidConfig = { subject: string; publicKey: string; privateKey: string }

/** The browser-facing subscription shape the transport sends to. */
export type PushTarget = { endpoint: string; keys: { p256dh: string; auth: string } }

/** Injected transport: web-push's sendNotification in production, a stub in tests. */
export type SendPush = (target: PushTarget, payload: string) => Promise<unknown>

export type NotifierDeps = {
  config: VapidConfig | null
  store: PushStore
  send: SendPush
  /** UTC calendar date YYYY-MM-DD; injectable for tests. */
  today: () => string
}

/** Yesterday, not today: keeps an evening sighting "today" for a logger west of UTC. */
function utcYesterday(todayIso: string): string {
  const parsed = new Date(`${todayIso}T00:00:00Z`)
  parsed.setUTCDate(parsed.getUTCDate() - 1)
  return parsed.toISOString().slice(0, 10)
}

export function payloadFor(sighting: Sighting): string {
  const glyph = standInFor(sighting.emoji)
  const qty = quantityTextSuffix(sighting.quantity)
  const title =
    sighting.name === null
      ? `${glyph} Natalie saw a critter${qty}!`
      : `${glyph} Natalie saw ${sighting.name}${qty}!`
  const details = [sighting.place, sighting.comment].filter((part) => part !== null).join(' — ')
  const photo = sighting.photoPath
  // 📸 marker so recipients know a photo is attached even where the hero image
  // itself doesn't render (notably iOS web push); the image shows big on
  // platforms that support it (Chrome/Android).
  const body = photo === null ? details : details === '' ? '📸' : `${details} 📸`
  const payload = photo === null ? { title, body, url: '/' } : { title, body, url: '/', image: photo }
  return JSON.stringify(payload)
}

function statusCodeOf(err: unknown): number | undefined {
  return typeof err === 'object' && err !== null && 'statusCode' in err && typeof err.statusCode === 'number'
    ? err.statusCode
    : undefined
}

export function createNotifier(deps: NotifierDeps) {
  return {
    publicKey: deps.config?.publicKey ?? null,

    /** Fire-and-forget: catches everything, never rejects. */
    async notifySighting(sighting: Sighting): Promise<void> {
      try {
        if (deps.config === null) return
        if (sighting.sightedOn < utcYesterday(deps.today())) return
        const subscriptions = await deps.store.listAll()
        const payload = payloadFor(sighting)
        await Promise.all(
          subscriptions.map(async (sub) => {
            try {
              await deps.send({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload)
            } catch (err) {
              const status = statusCodeOf(err)
              if (status === 404 || status === 410) await deps.store.removeByEndpoint(sub.endpoint)
              else console.error('push send failed:', err)
            }
          }),
        )
      } catch (err) {
        console.error('push notify failed:', err)
      }
    },
  }
}

export type Notifier = ReturnType<typeof createNotifier>
