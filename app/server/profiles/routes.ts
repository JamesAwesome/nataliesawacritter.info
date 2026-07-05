import { Router, type RequestHandler } from 'express'
import type { NewProfile, ProfilesStore } from './store.js'
import { UUID_RE, sendValidation, rejectUnknownFields } from '../httpValidation.js'

const KNOWN_FIELDS = new Set(['emoji', 'name', 'place'])

function parseNewProfile(body: unknown):
  | { ok: true; fields: NewProfile }
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

  // Trim before validating: friend identity keys on (emoji, name), so stray
  // whitespace must not mint distinct profiles.
  const name = typeof record.name === 'string' ? record.name.trim() : record.name
  if (typeof name !== 'string' || name.length === 0 || name.length > 100) {
    details.name = 'required, 1-100 characters'
  }

  let place: string | null = null
  const rawPlace = typeof record.place === 'string' ? record.place.trim() : record.place
  if (rawPlace === undefined || rawPlace === null || rawPlace === '') {
    place = null
  } else if (typeof rawPlace !== 'string' || rawPlace.length > 100) {
    details.place = 'must be a string of at most 100 characters'
  } else {
    place = rawPlace
  }

  if (Object.keys(details).length > 0) return { ok: false, details }
  return { ok: true, fields: { emoji: emoji as string, name: name as string, place } }
}

export function profilesRouter(store: ProfilesStore, writeGate: RequestHandler): Router {
  const router = Router()

  router.get('/', async (_req, res) => {
    res.json(await store.list())
  })

  router.post('/', writeGate, async (req, res) => {
    const parsed = parseNewProfile(req.body)
    if (!parsed.ok) {
      sendValidation(res, parsed.details)
      return
    }
    const result = await store.create(parsed.fields)
    if (!result.ok) {
      res.status(409).json({ error: 'conflict' })
      return
    }
    res.status(201).json(result.row)
  })

  router.delete('/:id', writeGate, async (req, res) => {
    const { id } = req.params as { id: string }
    if (!UUID_RE.test(id)) {
      sendValidation(res, { id: 'must be a uuid' })
      return
    }
    const removed = await store.remove(id)
    if (!removed) {
      res.status(404).json({ error: 'not found' })
      return
    }
    res.status(204).end()
  })

  return router
}
