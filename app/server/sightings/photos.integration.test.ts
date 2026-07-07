import { mkdtemp, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import type { createDb } from '../db/index.js'
import { createProfilesStore } from '../profiles/store.js'
import { createTestDb } from '../testDb.js'
import { basic, fakePushStore, nullNotifier, withServer } from '../testUtils.js'
import { createSightingsStore } from './store.js'

const AUTH = basic('natalie', 'sekrit')
// A real, decodable JPEG — the upload path re-encodes via sharp, which rejects
// non-images. Built in beforeAll.
let JPEG: Buffer

describe('photo lifecycle against real postgres + disk', () => {
  let handle: ReturnType<typeof createDb>
  let photosDir: string

  beforeAll(async () => {
    handle = await createTestDb()
    photosDir = await mkdtemp(path.join(tmpdir(), 'photos-'))
    JPEG = await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 10, g: 20, b: 30 } } })
      .jpeg()
      .toBuffer()
  })

  afterAll(async () => {
    await handle?.pool.end()
  })

  function app() {
    return createApp({
      checkDb: async () => {
        await handle.pool.query('SELECT 1')
      },
      sightingsStore: createSightingsStore(handle.db),
      profilesStore: createProfilesStore(handle.db),
      writeCredentials: { user: 'natalie', password: 'sekrit' },
      photosDir,
      pushStore: fakePushStore(),
      notifier: nullNotifier(),
      siteUrl: 'https://example.test',
    })
  }

  it('PUT → GET → replace (old file gone) → DELETE photo → sighting delete removes file', async () => {
    await withServer(app(), async (base) => {
      const created = await fetch(`${base}/api/sightings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: AUTH },
        body: JSON.stringify({ emoji: '🦊', sightedOn: '2026-07-04' }),
      })
      const sighting = (await created.json()) as { id: string }

      const put1 = await fetch(`${base}/api/sightings/${sighting.id}/photo`, {
        method: 'PUT',
        headers: { 'content-type': 'image/jpeg', authorization: AUTH },
        body: JPEG,
      })
      expect(put1.status).toBe(200)
      const { photoPath } = (await put1.json()) as { photoPath: string }

      const got = await fetch(`${base}${photoPath}`)
      expect(got.status).toBe(200)
      expect(got.headers.get('cache-control')).toContain('immutable')

      const put2 = await fetch(`${base}/api/sightings/${sighting.id}/photo`, {
        method: 'PUT',
        headers: { 'content-type': 'image/jpeg', authorization: AUTH },
        body: JPEG,
      })
      const second = (await put2.json()) as { photoPath: string }
      expect(second.photoPath).not.toBe(photoPath)
      expect(await readdir(photosDir)).toHaveLength(1)

      const del = await fetch(`${base}/api/sightings/${sighting.id}/photo`, {
        method: 'DELETE',
        headers: { authorization: AUTH },
      })
      expect(del.status).toBe(204)
      expect(await readdir(photosDir)).toHaveLength(0)

      const put3 = await fetch(`${base}/api/sightings/${sighting.id}/photo`, {
        method: 'PUT',
        headers: { 'content-type': 'image/jpeg', authorization: AUTH },
        body: JPEG,
      })
      expect(put3.status).toBe(200)
      const gone = await fetch(`${base}/api/sightings/${sighting.id}`, {
        method: 'DELETE',
        headers: { authorization: AUTH },
      })
      expect(gone.status).toBe(204)
      expect(await readdir(photosDir)).toHaveLength(0)
    })
  })
})
