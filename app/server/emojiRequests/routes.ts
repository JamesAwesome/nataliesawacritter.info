import { Router, type RequestHandler } from 'express'
import type { EmojiRequestsStore, NewEmojiRequest } from './store.js'
import { UUID_RE, sendValidation, rejectUnknownFields } from '../httpValidation.js'

const KNOWN_FIELDS = new Set(['name', 'note'])

function parseNewRequest(body: unknown):
  | { ok: true; fields: NewEmojiRequest }
  | { ok: false; details: Record<string, string> } {
  const details = Object.create(null) as Record<string, string>
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, details: { body: 'must be a JSON object' } }
  }
  const record = body as Record<string, unknown>

  rejectUnknownFields(record, KNOWN_FIELDS, details)

  const name = typeof record.name === 'string' ? record.name.trim() : record.name
  if (typeof name !== 'string' || name.length === 0 || name.length > 80) {
    details.name = 'required, 1-80 characters'
  }

  let note: string | null = null
  const rawNote = typeof record.note === 'string' ? record.note.trim() : record.note
  if (rawNote === undefined || rawNote === null || rawNote === '') {
    note = null
  } else if (typeof rawNote !== 'string' || rawNote.length > 500) {
    details.note = 'must be a string of at most 500 characters'
  } else {
    note = rawNote
  }

  if (Object.keys(details).length > 0) return { ok: false, details }
  return { ok: true, fields: { name: name as string, note } }
}

/** All routes are behind writeGate — the request list is owner-only, so even
 *  the GET is gated (unlike the public sighting reads). */
export function emojiRequestsRouter(store: EmojiRequestsStore, writeGate: RequestHandler): Router {
  const router = Router()

  router.get('/', writeGate, async (_req, res) => {
    res.json(await store.list())
  })

  router.post('/', writeGate, async (req, res) => {
    const parsed = parseNewRequest(req.body)
    if (!parsed.ok) {
      sendValidation(res, parsed.details)
      return
    }
    res.status(201).json(await store.create(parsed.fields))
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
