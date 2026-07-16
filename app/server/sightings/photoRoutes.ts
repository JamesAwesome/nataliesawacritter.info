import { randomUUID } from 'node:crypto'
import { rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import express, { Router, type RequestHandler } from 'express'
import { UUID_RE, sendValidation } from '../httpValidation.js'
import { stripJpegExif } from './stripJpeg.js'
import type { Sighting, SightingsStore } from './store.js'

// The `-<epoch>` suffix is optional so pre-existing on-disk photos
// (`<uuid>-<epoch>.jpg`, from before filenames were randomized) still serve.
export const PHOTO_FILENAME_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(-\d+)?\.jpg$/i

const rawJpeg = express.raw({ type: 'image/jpeg', limit: '6mb' })

export async function removePhotoFile(photosDir: string, photoPath: string | null): Promise<void> {
  if (photoPath === null) return
  // photoPath is the API path (/api/photos/<file>); basename is the disk name.
  await rm(path.join(photosDir, path.basename(photoPath)), { force: true }).catch(() => {
    // best-effort cleanup: a missing file must never fail the request
  })
}

export function sightingPhotoRouter(
  store: SightingsStore,
  writeGate: RequestHandler,
  photosDir: string,
  onPhotoAttached: (sighting: Sighting) => void = () => {},
): Router {
  const router = Router()

  router.put('/:id/photo', writeGate, rawJpeg, async (req, res) => {
    const { id } = req.params as { id: string }
    if (!UUID_RE.test(id)) {
      sendValidation(res, { id: 'must be a uuid' })
      return
    }
    // express.raw only parses matching content-types; anything else leaves a non-Buffer body.
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      sendValidation(res, { photo: 'must be a non-empty image/jpeg body' })
      return
    }
    let clean: Buffer
    try {
      clean = await stripJpegExif(req.body)
    } catch {
      sendValidation(res, { photo: 'must be a valid image/jpeg' })
      return
    }
    const existing = await store.getById(id)
    if (existing === null) {
      res.status(404).json({ error: 'not found' })
      return
    }
    const filename = `${randomUUID()}.jpg`
    await writeFile(path.join(photosDir, filename), clean)
    const updated = await store.setPhotoPath(id, `/api/photos/${filename}`)
    if (updated === null) {
      // row vanished between getById and update (single-user app: effectively unreachable)
      await removePhotoFile(photosDir, `/api/photos/${filename}`)
      res.status(404).json({ error: 'not found' })
      return
    }
    await removePhotoFile(photosDir, existing.photoPath)
    onPhotoAttached(updated)
    res.json(updated)
  })

  router.delete('/:id/photo', writeGate, async (req, res) => {
    const { id } = req.params as { id: string }
    if (!UUID_RE.test(id)) {
      sendValidation(res, { id: 'must be a uuid' })
      return
    }
    const existing = await store.getById(id)
    if (existing === null) {
      res.status(404).json({ error: 'not found' })
      return
    }
    await store.setPhotoPath(id, null)
    await removePhotoFile(photosDir, existing.photoPath)
    res.status(204).end()
  })

  return router
}

export function photoFileRouter(photosDir: string): Router {
  const router = Router()

  router.get('/:filename', (req, res) => {
    const { filename } = req.params as { filename: string }
    if (!PHOTO_FILENAME_RE.test(filename)) {
      sendValidation(res, { filename: 'invalid photo name' })
      return
    }
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.sendFile(filename, { root: photosDir, immutable: true, maxAge: '365d' }, (err) => {
      if (err !== undefined && !res.headersSent) {
        res.status(404).json({ error: 'not found' })
      }
    })
  })

  return router
}
