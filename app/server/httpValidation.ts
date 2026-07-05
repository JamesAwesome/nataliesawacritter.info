import type { Response } from 'express'

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function sendValidation(res: Response, details: Record<string, string>): void {
  res.status(400).json({ error: 'validation', details })
}

export function rejectUnknownFields(
  record: Record<string, unknown>,
  known: ReadonlySet<string>,
  details: Record<string, string>,
): void {
  for (const key of Object.keys(record)) {
    if (!known.has(key)) details[key] = 'unknown field'
  }
}
