import { buildClaudeArgs } from './claudeCommand'
import { buildTask } from './task'
import { parseResult } from './parseResult'
import type { AgentResult, AgentRunner, PendingRequest } from './types'

export type ExecResult = { code: number; stdout: string; stderr: string }
export type Exec = (cmd: string, args: string[], opts: { cwd: string }) => Promise<ExecResult>

/** Deterministic branch name from the request (unique via the id prefix). */
export function branchFor(request: PendingRequest): string {
  const slug = request.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'critter'
  return `emoji-request/${slug}-${request.id.slice(0, 8)}`
}

/** Runs the coding agent for one request in a throwaway git worktree off
 *  origin/main. The agent (following the skill) draws the emoji, tests, and
 *  opens a PR — the runner just isolates it, invokes it, and reads the RESULT.
 *  `exec` is injected so the whole flow is testable without spending tokens. */
export function createAgentRunner(deps: {
  repoDir: string
  worktreesDir: string
  model: string
  maxTurns: number
  exec: Exec
  log?: (message: string) => void
}): AgentRunner {
  const log = deps.log ?? (() => {})
  return async (request: PendingRequest): Promise<AgentResult> => {
    const branch = branchFor(request)
    const worktree = `${deps.worktreesDir}/${branch.replace(/\//g, '_')}`
    try {
      await deps.exec('git', ['-C', deps.repoDir, 'fetch', 'origin', 'main'], { cwd: deps.repoDir })
      await deps.exec('git', ['-C', deps.repoDir, 'worktree', 'add', '-B', branch, worktree, 'origin/main'], {
        cwd: deps.repoDir,
      })

      log(`running agent for "${request.name}" on ${branch}`)
      const run = await deps.exec('claude', buildClaudeArgs(buildTask(request), { model: deps.model, maxTurns: deps.maxTurns }), {
        cwd: worktree,
      })
      if (run.code !== 0) {
        return { kind: 'error', message: `claude exited ${run.code}: ${run.stderr.slice(0, 300)}` }
      }

      // `--output-format json` → the final assistant message is `.result`.
      let finalMessage: string
      try {
        finalMessage = String((JSON.parse(run.stdout) as { result?: unknown }).result ?? '')
      } catch {
        finalMessage = run.stdout
      }
      return parseResult(finalMessage)
    } catch (err) {
      return { kind: 'error', message: err instanceof Error ? err.message : String(err) }
    } finally {
      // Best-effort cleanup; the branch itself lives on origin (pushed by the agent).
      await deps.exec('git', ['-C', deps.repoDir, 'worktree', 'remove', '--force', worktree], { cwd: deps.repoDir }).catch(
        () => {},
      )
    }
  }
}
