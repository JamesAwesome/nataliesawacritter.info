import { migrate } from 'drizzle-orm/node-postgres/migrator'
import webpush from 'web-push'
import { createApp } from './app.js'
import { createDb } from './db/index.js'
import { waitForDb } from './db/waitForDb.js'
import { createProfilesStore } from './profiles/store.js'
import { createEmojiRequestsStore } from './emojiRequests/store.js'
import { createRequestAlerter } from './emojiRequests/alerter.js'
import { createNotifier, type SendPush } from './push/notifier.js'
import { createPushStore } from './push/store.js'
import { createSightingsStore } from './sightings/store.js'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}

const { pool, db } = createDb(connectionString)

// The database may not be reachable the instant we boot (postgres still starting,
// mid-restart, or DNS not yet resolving `postgres`). Wait for a live connection
// with backoff instead of crashing on the first getaddrinfo/ECONNREFUSED error.
await waitForDb(() => pool.query('SELECT 1'), {
  onRetry: (error, attempt, delayMs) => {
    const code = (error as { cause?: { code?: string }; code?: string })?.cause?.code ??
      (error as { code?: string })?.code
    console.warn(`database not reachable (attempt ${attempt}: ${code}); retrying in ${delayMs}ms`)
  },
})

// cwd-relative: run from app/ in dev, /app in the container
await migrate(db, { migrationsFolder: 'drizzle' })
console.log('migrations up to date')

const writeUser = process.env.WRITE_USER ?? ''
const writePassword = process.env.WRITE_PASSWORD ?? ''
const writeCredentials =
  writeUser !== '' && writePassword !== '' ? { user: writeUser, password: writePassword } : null
if (!writeCredentials) {
  const missing = [writeUser === '' ? 'WRITE_USER' : null, writePassword === '' ? 'WRITE_PASSWORD' : null]
    .filter(Boolean)
    .join(' and ')
  console.warn(`${missing} not set — write endpoints disabled (503)`)
}

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY ?? ''
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY ?? ''
const vapidSubject = process.env.VAPID_SUBJECT ?? ''
const vapidConfig =
  vapidPublicKey !== '' && vapidPrivateKey !== '' && vapidSubject !== ''
    ? { subject: vapidSubject, publicKey: vapidPublicKey, privateKey: vapidPrivateKey }
    : null
console.log(vapidConfig ? 'push notifications enabled' : 'push notifications disabled (VAPID_* not set)')

const pushStore = createPushStore(db)
const sendPush: SendPush = vapidConfig
  ? (target, payload) => webpush.sendNotification(target, payload, { vapidDetails: vapidConfig })
  : async () => {
      throw new Error('push disabled')
    }
const notifier = createNotifier({
  config: vapidConfig,
  store: pushStore,
  send: sendPush,
  today: () => new Date().toISOString().slice(0, 10),
})

const siteUrl = process.env.SITE_URL ?? 'https://nataliesawacritter.info'

// Emoji-request alerts: POST to a single secret ntfy topic → the owner's phone.
// Unset → no-op. NTFY_URL is operator-configured (not user input), so no SSRF risk.
const ntfyUrl = process.env.NTFY_URL
console.log(ntfyUrl ? 'emoji-request alerts enabled (ntfy)' : 'emoji-request alerts disabled (NTFY_URL not set)')
const requestAlerter = createRequestAlerter({
  config: ntfyUrl ? { url: ntfyUrl } : null,
  send: async (url, message) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Title: message.title, Tags: message.tags },
      body: message.body,
    })
    if (!res.ok) throw new Error(`ntfy responded ${res.status}`)
  },
})

const app = createApp({
  checkDb: async () => {
    await pool.query('SELECT 1')
  },
  sightingsStore: createSightingsStore(db),
  profilesStore: createProfilesStore(db),
  emojiRequestsStore: createEmojiRequestsStore(db),
  requestAlerter,
  writeCredentials,
  photosDir: process.env.PHOTOS_DIR ?? '/data/photos',
  pushStore,
  notifier,
  siteUrl,
})

const port = Number(process.env.PORT ?? 8080)
const server = app.listen(port, () => {
  console.log(`critter-tracker listening on :${port}`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => {
      void pool.end()
    })
  })
}
