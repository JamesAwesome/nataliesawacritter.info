import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import express, { type Express, type RequestHandler } from 'express'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requireWriteAuth } from '../auth.js'
import { errorHandler } from '../errorHandler.js'
import { withServer } from '../testUtils.js'
import { photoFileRouter, sightingPhotoRouter, PHOTO_FILENAME_RE } from './photoRoutes.js'
import type { Sighting, SightingsStore } from './store.js'

const ID = '3f9a26cc-1c0e-4c3a-9b52-08a1c2f4d9aa'
const UUID_RE_SRC = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

// A minimal but well-formed JPEG (SOI, APP0, SOS + scan bytes, EOI) with no
// APP1/EXIF segment, so stripJpegExif() passes it through byte-for-byte —
// keeping the "written file equals input" assertions below meaningful.
function seg(marker: number, payload: Buffer): Buffer {
  const len = Buffer.alloc(2)
  len.writeUInt16BE(payload.length + 2, 0)
  return Buffer.concat([Buffer.from([0xff, marker]), len, payload])
}
const app0 = seg(0xe0, Buffer.from('JFIF\0'))
const sos = Buffer.concat([seg(0xda, Buffer.from([0x00, 0x01])), Buffer.from([0x12, 0x34])])
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sos, Buffer.from([0xff, 0xd9])])

function row(overrides: Partial<Sighting> = {}): Sighting {
  return {
    id: ID,
    emoji: '🦊',
    name: 'Mr Fox',
    sightedOn: '2026-07-04',
    sightedTime: null,
    place: null,
    comment: null,
    photoPath: null,
    createdAt: new Date('2026-07-04T12:00:00Z'),
    ...overrides,
  }
}

function fakeStore(overrides: Partial<SightingsStore> = {}): SightingsStore {
  return {
    list: vi.fn(async () => []),
    create: vi.fn(async () => row()),
    remove: vi.fn(async () => true),
    getById: vi.fn(async () => row()),
    setPhotoPath: vi.fn(async (_id, photoPath) => row({ photoPath })),
    ...overrides,
  }
}

let photosDir: string

beforeEach(async () => {
  photosDir = await mkdtemp(path.join(tmpdir(), 'photos-'))
})

const passGate: RequestHandler = (_req, _res, next) => next()

function appWith(store: SightingsStore, gate: RequestHandler = passGate): Express {
  const app = express()
  app.use('/api/sightings', sightingPhotoRouter(store, gate, photosDir))
  app.use('/api/photos', photoFileRouter(photosDir))
  app.use(errorHandler)
  return app
}

// `BodyInit` isn't part of this project's global type surface (only fetch's
// Request/Response/RequestInit are ambient-declared), so derive the body type
// from RequestInit itself rather than reference it directly.
async function put(base: string, id: string, body: RequestInit['body'], contentType = 'image/jpeg') {
  return fetch(`${base}/api/sightings/${id}/photo`, {
    method: 'PUT',
    headers: contentType === '' ? {} : { 'content-type': contentType },
    body,
  })
}

describe('PHOTO_FILENAME_RE', () => {
  it('accepts our generated shape and rejects traversal', () => {
    expect(PHOTO_FILENAME_RE.test(`${ID}.jpg`)).toBe(true)
    expect(PHOTO_FILENAME_RE.test('../etc/passwd')).toBe(false)
    expect(PHOTO_FILENAME_RE.test(`${ID}-1.png`)).toBe(false)
  })

  it('still accepts pre-existing <uuid>-<epoch>.jpg names for backward compatibility', () => {
    expect(PHOTO_FILENAME_RE.test(`${ID}-1751700000000.jpg`)).toBe(true)
  })
})

describe('PUT /api/sightings/:id/photo', () => {
  it('writes the file, updates the store, and returns the updated sighting', async () => {
    const store = fakeStore()
    await withServer(appWith(store), async (base) => {
      const res = await put(base, ID, JPEG)
      expect(res.status).toBe(200)
      const body = (await res.json()) as { photoPath: string }
      expect(body.photoPath).toMatch(new RegExp(`^/api/photos/${UUID_RE_SRC}\\.jpg$`))
      expect(path.basename(body.photoPath)).not.toBe(`${ID}.jpg`) // random, not the sighting id
      const filename = path.basename(body.photoPath)
      expect(store.setPhotoPath).toHaveBeenCalledWith(ID, `/api/photos/${filename}`)
      expect(await readFile(path.join(photosDir, filename))).toEqual(JPEG)
    })
  })

  it('deletes the previous file on replace', async () => {
    const oldName = `${ID}-1000.jpg`
    await writeFile(path.join(photosDir, oldName), JPEG)
    const store = fakeStore({
      getById: vi.fn(async () => row({ photoPath: `/api/photos/${oldName}` })),
    })
    await withServer(appWith(store), async (base) => {
      expect((await put(base, ID, JPEG)).status).toBe(200)
      const files = await readdir(photosDir)
      expect(files).toHaveLength(1)
      expect(files[0]).not.toBe(oldName)
    })
  })

  it.each([
    ['non-uuid id', (base: string) => put(base, '42', JPEG)],
    ['wrong content-type', (base: string) => put(base, ID, JPEG, 'image/png')],
    ['empty body', (base: string) => put(base, ID, null)],
    ['non-JPEG body', (base: string) => put(base, ID, Buffer.from('nope'))],
  ])('400s on %s without touching the store', async (_label, mk) => {
    const store = fakeStore()
    await withServer(appWith(store), async (base) => {
      expect((await mk(base)).status).toBe(400)
      expect(store.setPhotoPath).not.toHaveBeenCalled()
    })
  })

  it('400s a non-JPEG body (bad magic bytes) with a photo validation detail', async () => {
    const store = fakeStore()
    await withServer(appWith(store), async (base) => {
      const res = await put(base, ID, Buffer.from('nope'))
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: 'validation'; details: Record<string, string> }
      expect(body.details.photo).toBeDefined()
    })
  })

  it('404s an unknown id', async () => {
    const store = fakeStore({ getById: vi.fn(async () => null) })
    await withServer(appWith(store), async (base) => {
      expect((await put(base, ID, JPEG)).status).toBe(404)
      expect((await readdir(photosDir))).toHaveLength(0)
    })
  })

  it('413s an oversized body with the payload envelope', async () => {
    const store = fakeStore()
    await withServer(appWith(store), async (base) => {
      const res = await put(base, ID, Buffer.alloc(7 * 1024 * 1024))
      expect(res.status).toBe(413)
      expect(await res.json()).toEqual({ error: 'payload too large' })
    })
  })

  it('is auth-gated', async () => {
    await withServer(appWith(fakeStore(), requireWriteAuth('natalie', 'sekrit')), async (base) => {
      expect((await put(base, ID, JPEG)).status).toBe(401)
    })
  })
})

describe('DELETE /api/sightings/:id/photo', () => {
  it('clears the path, removes the file, 204s; idempotent when no photo', async () => {
    const name = `${ID}-1000.jpg`
    await writeFile(path.join(photosDir, name), JPEG)
    const store = fakeStore({ getById: vi.fn(async () => row({ photoPath: `/api/photos/${name}` })) })
    await withServer(appWith(store), async (base) => {
      const res = await fetch(`${base}/api/sightings/${ID}/photo`, { method: 'DELETE' })
      expect(res.status).toBe(204)
      expect(store.setPhotoPath).toHaveBeenCalledWith(ID, null)
      expect(await readdir(photosDir)).toHaveLength(0)
    })
    await withServer(appWith(fakeStore()), async (base) => {
      expect((await fetch(`${base}/api/sightings/${ID}/photo`, { method: 'DELETE' })).status).toBe(204)
    })
  })

  it('404s unknown id and 400s non-uuid', async () => {
    await withServer(appWith(fakeStore({ getById: vi.fn(async () => null) })), async (base) => {
      expect((await fetch(`${base}/api/sightings/${ID}/photo`, { method: 'DELETE' })).status).toBe(404)
    })
    await withServer(appWith(fakeStore()), async (base) => {
      expect((await fetch(`${base}/api/sightings/42/photo`, { method: 'DELETE' })).status).toBe(400)
    })
  })
})

describe('GET /api/photos/:filename', () => {
  it('serves the file with immutable caching', async () => {
    const name = `${ID}-1000.jpg`
    await writeFile(path.join(photosDir, name), JPEG)
    await withServer(appWith(fakeStore()), async (base) => {
      const res = await fetch(`${base}/api/photos/${name}`)
      expect(res.status).toBe(200)
      expect(res.headers.get('cache-control')).toContain('immutable')
      expect(res.headers.get('x-content-type-options')).toBe('nosniff')
      expect(Buffer.from(await res.arrayBuffer())).toEqual(JPEG)
    })
  })

  it('400s bad filenames and 404s missing files', async () => {
    await withServer(appWith(fakeStore()), async (base) => {
      expect((await fetch(`${base}/api/photos/..%2Fsecret.jpg`)).status).toBe(400)
      expect((await fetch(`${base}/api/photos/${ID}-9.jpg`)).status).toBe(404)
    })
  })
})
