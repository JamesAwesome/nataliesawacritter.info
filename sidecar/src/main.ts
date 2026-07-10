import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createAgentRunner, type Exec } from './agentRunner'
import { parseConfig } from './config'
import { existingNames } from './existingNames'
import { prStateOf } from './prState'
import { processNext } from './processNext'
import { reconcile } from './reconcile'
import { createRequestsClient } from './requestsClient'

const pexec = promisify(execFile)

/** Real process exec — never throws; returns the child's code + output. */
const exec: Exec = async (cmd, args, opts) => {
  try {
    const { stdout, stderr } = await pexec(cmd, args, { cwd: opts.cwd, maxBuffer: 32 * 1024 * 1024, env: process.env })
    return { code: 0, stdout, stderr }
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string }
    return { code: typeof e.code === 'number' ? e.code : 1, stdout: e.stdout ?? '', stderr: e.stderr ?? String(err) }
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function main(): Promise<void> {
  const config = parseConfig(process.env)
  const log = (message: string) => console.log(`[sidecar] ${message}`)
  log(`up — app ${config.appBaseUrl}, model ${config.model}, poll ${config.pollIntervalMs}ms${config.dryRun ? ' (DRY RUN)' : ''}`)

  const client = createRequestsClient({ baseUrl: config.appBaseUrl, authHeader: config.authHeader, fetch: globalThis.fetch })
  const runAgent = createAgentRunner({
    repoDir: config.repoDir,
    worktreesDir: '/tmp/sidecar-worktrees',
    model: config.model,
    maxTurns: 40,
    exec,
    log,
  })

  for (;;) {
    try {
      if (config.dryRun) {
        // Read-only: report what would be processed, touch nothing.
        const pending = await client.listPending()
        log(`DRY RUN — ${pending.length} pending${pending.length ? `: ${pending.map((r) => r.name).join(', ')}` : ''}`)
      } else {
        const result = await processNext({ client, runAgent, existingNames: existingNames(config.repoDir), log })
        if (result.status !== 'idle') log(`→ ${JSON.stringify(result)}`)
        // Remove requests whose PR has been merged (accepted).
        const { removed } = await reconcile({ client, prState: (url) => prStateOf(exec, url), log })
        if (removed.length > 0) log(`reconciled ${removed.length} merged`)
      }
    } catch (err) {
      log(`loop error: ${err instanceof Error ? err.message : String(err)}`)
    }
    await sleep(config.pollIntervalMs)
  }
}

main().catch((err) => {
  console.error(`[sidecar] fatal: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
