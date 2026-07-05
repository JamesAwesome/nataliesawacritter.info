import { Router } from 'express'
import { rejectUnknownFields, sendValidation } from '../httpValidation.js'
import type { NewSubscription, PushStore } from './store.js'

const KNOWN_FIELDS = new Set(['endpoint', 'keys'])
const KNOWN_KEY_FIELDS = new Set(['p256dh', 'auth'])

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

function parseSubscription(body: unknown):
  | { ok: true; fields: NewSubscription }
  | { ok: false; details: Record<string, string> } {
  const details = Object.create(null) as Record<string, string>
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, details: { body: 'must be a JSON object' } }
  }
  const record = body as Record<string, unknown>
  rejectUnknownFields(record, KNOWN_FIELDS, details)

  const endpoint = record.endpoint
  if (typeof endpoint !== 'string' || endpoint.length > 1000 || !isHttpsUrl(endpoint)) {
    details.endpoint = 'required, must be an https URL of at most 1000 characters'
  }

  const keyValues = { p256dh: '', auth: '' }
  const keys = record.keys
  if (typeof keys !== 'object' || keys === null || Array.isArray(keys)) {
    details.keys = 'required, must be an object with p256dh and auth'
  } else {
    const keyRecord = keys as Record<string, unknown>
    for (const key of Object.keys(keyRecord)) {
      if (!KNOWN_KEY_FIELDS.has(key)) details[`keys.${key}`] = 'unknown field'
    }
    for (const field of ['p256dh', 'auth'] as const) {
      const value = keyRecord[field]
      if (typeof value !== 'string' || value.length === 0 || value.length > 200) {
        details[`keys.${field}`] = 'required, 1-200 characters'
      } else {
        keyValues[field] = value
      }
    }
  }

  if (Object.keys(details).length > 0) return { ok: false, details }
  return { ok: true, fields: { endpoint: endpoint as string, ...keyValues } }
}

export function pushRouter(store: PushStore, vapidPublicKey: string | null): Router {
  const router = Router()

  if (vapidPublicKey === null) {
    router.use((_req, res) => {
      res.status(503).json({ error: 'push disabled' })
    })
    return router
  }

  router.get('/vapid-public-key', (_req, res) => {
    res.json({ key: vapidPublicKey })
  })

  router.post('/subscriptions', async (req, res) => {
    const parsed = parseSubscription(req.body)
    if (!parsed.ok) {
      sendValidation(res, parsed.details)
      return
    }
    await store.upsert(parsed.fields)
    res.status(201).json({ ok: true })
  })

  router.delete('/subscriptions', async (req, res) => {
    const body = req.body as unknown
    const endpoint =
      typeof body === 'object' && body !== null ? (body as Record<string, unknown>).endpoint : undefined
    if (typeof endpoint !== 'string' || endpoint.length === 0) {
      sendValidation(res, { endpoint: 'required' })
      return
    }
    await store.removeByEndpoint(endpoint)
    res.status(204).end()
  })

  return router
}
