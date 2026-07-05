import type { Express } from 'express'
import { createNotifier, type Notifier } from './push/notifier.js'
import type { PushStore } from './push/store.js'

/** Start `app` on an ephemeral port, run `fn` against it, always close. */
export async function withServer(app: Express, fn: (baseUrl: string) => Promise<void>) {
  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('unexpected server address')
  try {
    await fn(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    )
  }
}

export function basic(user: string, pass: string): string {
  return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64')
}

/** Inert push deps for suites that don't exercise push. */
export function fakePushStore(): PushStore {
  return { upsert: async () => {}, removeByEndpoint: async () => true, listAll: async () => [] }
}

export function nullNotifier(): Notifier {
  return createNotifier({ config: null, store: fakePushStore(), send: async () => ({}), today: () => '2026-07-05' })
}
