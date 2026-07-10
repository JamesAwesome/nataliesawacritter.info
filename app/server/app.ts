import path from 'node:path'
import express, { type Express, type RequestHandler } from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import { requireWriteAuth } from './auth.js'
import { errorHandler } from './errorHandler.js'
import { feedRouter } from './feed/routes.js'
import { profilesRouter } from './profiles/routes.js'
import { emojiRequestsRouter } from './emojiRequests/routes.js'
import type { EmojiRequestsStore } from './emojiRequests/store.js'
import type { ProfilesStore } from './profiles/store.js'
import type { Notifier } from './push/notifier.js'
import { pushRouter } from './push/routes.js'
import type { PushStore } from './push/store.js'
import { photoFileRouter, sightingPhotoRouter } from './sightings/photoRoutes.js'
import { sightingsRouter } from './sightings/routes.js'
import type { SightingsStore } from './sightings/store.js'

export interface AppDeps {
  /** Resolves if the database is reachable, throws otherwise. */
  checkDb: () => Promise<void>
  sightingsStore: SightingsStore
  profilesStore: ProfilesStore
  emojiRequestsStore: EmojiRequestsStore
  /** null → write endpoints respond 503 "writes disabled" (deny by default). */
  writeCredentials: { user: string; password: string } | null
  photosDir: string
  pushStore: PushStore
  /** publicKey null → push endpoints 503 and notifySighting no-ops. */
  notifier: Notifier
  siteUrl: string
  /** Rate-limit ceilings per minute per client IP. Defaults applied in createApp. */
  rateLimits?: { authPerMin: number; mutationPerMin: number }
}

const writesDisabled: RequestHandler = (_req, res) => {
  res.status(503).json({ error: 'writes disabled' })
}

export function createApp(deps: AppDeps): Express {
  const app = express()
  app.disable('x-powered-by')
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          manifestSrc: ["'self'"],
          workerSrc: ["'self'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          objectSrc: ["'none'"],
        },
      },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  )
  app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    next()
  })

  const limits = deps.rateLimits ?? { authPerMin: 10, mutationPerMin: 30 }
  // Origin is tunnel-only, so CF-Connecting-IP (set by Cloudflare) is trustworthy;
  // fall back to req.ip for local/dev.
  const clientKey = (req: express.Request): string => {
    const cf = req.headers['cf-connecting-ip']
    return (typeof cf === 'string' ? cf : req.ip) ?? 'unknown'
  }
  const validate = { trustProxy: false, xForwardedForHeader: false }
  const mutationLimiter = rateLimit({
    windowMs: 60_000,
    limit: limits.mutationPerMin,
    keyGenerator: clientKey,
    skip: (req) => req.method === 'GET', // public reads/feed unaffected
    standardHeaders: true,
    legacyHeaders: false,
    validate,
  })
  // Counts only FAILED requests (401/4xx), so it throttles credential
  // brute-force across every route that checks the write password — the
  // auth-check AND the write verbs — without ever limiting a legit user's
  // successful writes. Closes the "brute-force via POST /api/sightings at the
  // looser mutation ceiling" lane.
  const authLimiter = rateLimit({
    windowMs: 60_000,
    limit: limits.authPerMin,
    keyGenerator: clientKey,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    validate,
  })
  app.use(mutationLimiter)
  app.use(authLimiter)

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

  // Entry gate for the logging flow: lets the client verify the magic word
  // before showing the picker. Semantics come entirely from writeGate.
  app.get('/api/auth/check', writeGate, (_req, res) => {
    res.status(204).end()
  })

  app.use(
    '/api/sightings',
    sightingsRouter(deps.sightingsStore, writeGate, deps.photosDir, (sighting) => {
      void deps.notifier.notifySighting(sighting) // fire-and-forget; notifier never rejects
    }),
  )
  app.use('/api/sightings', sightingPhotoRouter(deps.sightingsStore, writeGate, deps.photosDir))
  app.use('/api/photos', photoFileRouter(deps.photosDir))
  app.use('/api/profiles', profilesRouter(deps.profilesStore, writeGate))
  app.use('/api/emoji-requests', emojiRequestsRouter(deps.emojiRequestsStore, writeGate))
  app.use('/api/push', pushRouter(deps.pushStore, deps.notifier.publicKey))
  app.use(feedRouter(deps.sightingsStore, deps.siteUrl))

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
