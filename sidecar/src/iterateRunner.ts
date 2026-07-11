import type { Exec } from './agentRunner'
import { buildClaudeArgs } from './claudeCommand'
import { buildIterateTask } from './iterateTask'
import { parseIterateResult, type IterateResult } from './parseIterateResult'
import type { SidecarPr } from './prComments'

export type IterateRunner = (pr: SidecarPr, feedback: string) => Promise<IterateResult>

/** Runs the coding agent to iterate on an EXISTING PR. Unlike the create runner
 *  (which branches off origin/main), this checks out the PR's own head branch so
 *  the agent's commit + push updates the PR in place. `exec` is injected for
 *  testability. */
export function createIterateRunner(deps: {
  repoDir: string
  worktreesDir: string
  model: string
  maxTurns: number
  exec: Exec
  log?: (message: string) => void
}): IterateRunner {
  const log = deps.log ?? (() => {})
  return async (pr, feedback): Promise<IterateResult> => {
    const worktree = `${deps.worktreesDir}/iterate_${pr.headRefName.replace(/\//g, '_')}`
    try {
      await deps.exec('git', ['-C', deps.repoDir, 'fetch', 'origin', pr.headRefName], { cwd: deps.repoDir })
      await deps.exec(
        'git',
        ['-C', deps.repoDir, 'worktree', 'add', '-B', pr.headRefName, worktree, `origin/${pr.headRefName}`],
        { cwd: deps.repoDir },
      )

      log(`iterating "${pr.headRefName}"`)
      const run = await deps.exec(
        'claude',
        buildClaudeArgs(buildIterateTask(pr, feedback), { model: deps.model, maxTurns: deps.maxTurns }),
        { cwd: worktree },
      )
      if (run.code !== 0) {
        return { kind: 'error', message: `claude exited ${run.code}: ${(run.stderr.trim() || run.stdout).slice(-1500).trim()}` }
      }

      let finalMessage: string
      try {
        finalMessage = String((JSON.parse(run.stdout) as { result?: unknown }).result ?? '')
      } catch {
        finalMessage = run.stdout
      }
      return parseIterateResult(finalMessage)
    } catch (err) {
      return { kind: 'error', message: err instanceof Error ? err.message : String(err) }
    } finally {
      await deps.exec('git', ['-C', deps.repoDir, 'worktree', 'remove', '--force', worktree], {
        cwd: deps.repoDir,
      }).catch(() => {})
    }
  }
}
