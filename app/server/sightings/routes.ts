import { Router, type RequestHandler } from 'express'
import { removePhotoFile } from './photoRoutes.js'
import type { NewSighting, Sighting, SightingsStore } from './store.js'
import { UUID_RE, sendValidation, rejectUnknownFields } from '../httpValidation.js'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isValidDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

/** Latest permitted sightedOn: UTC today + 1 day (grace for clients ahead of UTC). */
function maxAllowedDate(): string {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
    .toISOString()
    .slice(0, 10)
}

const OPTIONAL_LIMITS = { name: 100, sightedTime: 100, place: 100, comment: 1000 } as const
type OptionalField = keyof typeof OPTIONAL_LIMITS
const KNOWN_FIELDS = new Set(['emoji', 'sightedOn', ...Object.keys(OPTIONAL_LIMITS)])

function parseNewSighting(body: unknown):
  | { ok: true; fields: NewSighting }
  | { ok: false; details: Record<string, string> } {
  const details = Object.create(null) as Record<string, string>
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, details: { body: 'must be a JSON object' } }
  }
  const record = body as Record<string, unknown>

  rejectUnknownFields(record, KNOWN_FIELDS, details)

  const emoji = record.emoji
  if (typeof emoji !== 'string' || emoji.length === 0 || emoji.length > 16) {
    details.emoji = 'required, 1-16 characters'
  }

  const sightedOn = record.sightedOn
  if (typeof sightedOn !== 'string' || !isValidDate(sightedOn)) {
    details.sightedOn = 'required, must be YYYY-MM-DD'
  } else if (sightedOn > maxAllowedDate()) {
    details.sightedOn = 'must not be in the future'
  }

  const optionals = {} as Record<OptionalField, string | null>
  for (const field of Object.keys(OPTIONAL_LIMITS) as OptionalField[]) {
    const value = record[field]
    if (value === undefined || value === null || value === '') {
      optionals[field] = null
    } else if (typeof value !== 'string' || value.length > OPTIONAL_LIMITS[field]) {
      details[field] = `must be a string of at most ${OPTIONAL_LIMITS[field]} characters`
    } else {
      optionals[field] = value
    }
  }

  if (Object.keys(details).length > 0) return { ok: false, details }
  return {
    ok: true,
    fields: { emoji: emoji as string, sightedOn: sightedOn as string, ...optionals },
  }
}

export function sightingsRouter(store: SightingsStore, writeGate: RequestHandler, photosDir: string, onCreated: (sighting: Sighting) => void): Router {
  const router = Router()

  router.get('/', async (req, res) => {
    const details = Object.create(null) as Record<string, string>
    const parseBound = (value: unknown, key: 'from' | 'to'): string | undefined => {
      if (value === undefined) return undefined
      if (typeof value !== 'string' || !isValidDate(value)) {
        details[key] = 'must be YYYY-MM-DD'
        return undefined
      }
      return value
    }
    const from = parseBound(req.query.from, 'from')
    const to = parseBound(req.query.to, 'to')
    if (from !== undefined && to !== undefined && from > to) {
      details.from = 'must be on or before to'
    }
    if (Object.keys(details).length > 0) {
      sendValidation(res, details)
      return
    }
    res.json(await store.list({ from, to }))
  })

  router.post('/', writeGate, async (req, res) => {
    const parsed = parseNewSighting(req.body)
    if (!parsed.ok) {
      sendValidation(res, parsed.details)
      return
    }
    const created = await store.create(parsed.fields)
    onCreated(created)
    res.status(201).json(created)
  })

  router.delete('/:id', writeGate, async (req, res) => {
    const { id } = req.params as { id: string }
    if (!UUID_RE.test(id)) {
      sendValidation(res, { id: 'must be a uuid' })
      return
    }
    const existing = await store.getById(id)
    const removed = await store.remove(id)
    if (!removed) {
      res.status(404).json({ error: 'not found' })
      return
    }
    if (existing !== null) {
      await removePhotoFile(photosDir, existing.photoPath)
    }
    res.status(204).end()
  })

  return router
}
