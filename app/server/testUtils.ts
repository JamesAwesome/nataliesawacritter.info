import type { Express } from 'express'

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
