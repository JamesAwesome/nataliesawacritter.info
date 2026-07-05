import path from 'node:path'
import express, { type Express, type RequestHandler } from 'express'
import { requireWriteAuth } from './auth.js'
import { errorHandler } from './errorHandler.js'
import { profilesRouter } from './profiles/routes.js'
import type { ProfilesStore } from './profiles/store.js'
import { photoFileRouter, sightingPhotoRouter } from './sightings/photoRoutes.js'
import { sightingsRouter } from './sightings/routes.js'
import type { SightingsStore } from './sightings/store.js'

export interface AppDeps {
  /** Resolves if the database is reachable, throws otherwise. */
  checkDb: () => Promise<void>
  sightingsStore: SightingsStore
  profilesStore: ProfilesStore
  /** null → write endpoints respond 503 "writes disabled" (deny by default). */
  writeCredentials: { user: string; password: string } | null
  photosDir: string
}

const writesDisabled: RequestHandler = (_req, res) => {
  res.status(503).json({ error: 'writes disabled' })
}

export function createApp(deps: AppDeps): Express {
  const app = express()
  app.use(express.json())

  app.get('/api/health', async (_req, res) => {
    try {
      await deps.checkDb()
      res.json({ ok: true, db: true })
    } catch (err) {
      console.error('health check failed:', err)
      res.status(503).json({ ok: false, db: false })
    }
  })

  const writeGate = deps.writeCredentials
    ? requireWriteAuth(deps.writeCredentials.user, deps.writeCredentials.password)
    : writesDisabled
  app.use('/api/sightings', sightingsRouter(deps.sightingsStore, writeGate, deps.photosDir))
  app.use('/api/sightings', sightingPhotoRouter(deps.sightingsStore, writeGate, deps.photosDir))
  app.use('/api/photos', photoFileRouter(deps.photosDir))
  app.use('/api/profiles', profilesRouter(deps.profilesStore, writeGate))

  const clientDir = path.resolve(import.meta.dirname, '../client')
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
      res.status(404).json({ error: 'not found' })
      return
    }
    if (process.env.NODE_ENV === 'production') {
      next() // fall through to static / SPA fallback below
      return
    }
    res.status(404).send('client is served by vite in development')
  })
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(clientDir))
    app.use((_req, res) => {
      res.sendFile('index.html', { root: clientDir })
    })
  }

  app.use(errorHandler)

  return app
}
