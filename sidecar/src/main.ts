import { spawn } from 'node:child_process'
import { createAgentRunner, type Exec } from './agentRunner'
import { parseConfig } from './config'
import { existingNames } from './existingNames'
import { createIterateRunner } from './iterateRunner'
import { createPrComments, ghLogin, type PrComments } from './prComments'
import { processComments } from './processComments'
import { prStateOf } from './prState'
import { processNext } from './processNext'
import { reconcile } from './reconcile'
import { redact } from './redact'
import { createRequestsClient } from './requestsClient'

/** How many `/iterate` comments the sidecar will act on per PR per poll cycle. */
const PER_PR_ITERATION_CAP = 5

/** Real process exec — never throws; returns the child's code + output.
 *  stdin is /dev/null (`stdio[0] = 'ignore'`) so `claude -p` doesn't block on an
 *  empty pipe: execFile's default left stdin open, causing claude's "no stdin
 *  data received in 3s" stall and a spurious exit 1. */
const exec: Exec = (cmd, args, opts) =>
  new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d: Buffer) => {
      stdout += d
    })
    child.stderr.on('data', (d: Buffer) => {
      stderr += d
    })
    child.on('error', (err) => resolve({ code: 1, stdout, stderr: stderr + String(err) }))
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }))
  })

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function main(): Promise<void> {
  const config = parseConfig(process.env)
  const log = (message: string) => console.log(`[sidecar] ${redact(message)}`)
  log(`up — app ${config.appBaseUrl}, model ${config.model}, poll ${config.pollIntervalMs}ms${config.dryRun ? ' (DRY RUN)' : ''}`)

  const client = createRequestsClient({ baseUrl: config.appBaseUrl, authHeader: config.authHeader, fetch: globalThis.fetch })
  const runAgent = createAgentRunner({
    repoDir: config.repoDir,
    worktreesDir: '/tmp/sidecar-worktrees',
    model: config.model,
    maxTurns: config.maxTurns,
    exec,
    log,
  })
  const runIterate = createIterateRunner({
    repoDir: config.repoDir,
    worktreesDir: '/tmp/sidecar-worktrees',
    model: config.model,
    maxTurns: config.maxTurns,
    exec,
    log,
  })

  // Comment-iteration is opt-in via the allowlist (deny by default). Resolve the
  // sidecar's own login once so it can skip its own comments and its own reactions.
  let prComments: PrComments | null = null
  if (config.allowedCommenters.length === 0) {
    log('comment-iteration off (SIDECAR_ALLOWED_COMMENTERS empty)')
  } else {
    try {
      const selfLogin = await ghLogin(exec, config.repoDir)
      prComments = createPrComments({ exec, repoDir: config.repoDir, selfLogin, allowedCommenters: config.allowedCommenters, log })
      log(`comment-iteration on for [${config.allowedCommenters.join(', ')}] as @${selfLogin}`)
    } catch (err) {
      log(`comment-iteration unavailable: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  for (;;) {
    try {
      if (config.dryRun) {
        // Read-only: report what would be processed, touch nothing.
        const pending = await client.listPending()
        log(`DRY RUN — ${pending.length} pending${pending.length ? `: ${pending.map((r) => r.name).join(', ')}` : ''}`)
        if (prComments) {
          for (const pr of await prComments.listOpenPrs()) {
            const actionable = await prComments.listActionableComments(pr)
            if (actionable.length > 0) log(`DRY RUN — PR #${pr.number}: ${actionable.length} /iterate comment(s) pending`)
          }
        }
      } else {
        const result = await processNext({ client, runAgent, existingNames: existingNames(config.repoDir), log })
        if (result.status !== 'idle') log(`→ ${JSON.stringify(result)}`)
        // Apply /iterate PR comments (👀 ack → run → 🚀/😕 + reply).
        if (prComments) {
          const { ran } = await processComments({ prComments, runIterate, perPrCap: PER_PR_ITERATION_CAP, log })
          if (ran > 0) log(`ran ${ran} iteration(s)`)
        }
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
  console.error(`[sidecar] fatal: ${redact(err instanceof Error ? err.message : String(err))}`)
  process.exit(1)
})
