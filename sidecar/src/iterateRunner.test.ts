import { describe, expect, it, vi } from 'vitest'
import { createIterateRunner } from './iterateRunner'
import type { ExecResult } from './agentRunner'

const pr = { number: 12, headRefName: 'emoji-request/capybara-2e227072', url: 'https://x/pull/12' }
const claudeJson = (result: string): string => JSON.stringify({ result })

function runnerWith(handler: (cmd: string, args: string[]) => ExecResult) {
  const exec = vi.fn(async (cmd: string, args: string[], _opts: { cwd: string }) => handler(cmd, args))
  const runIterate = createIterateRunner({
    repoDir: '/repo',
    worktreesDir: '/tmp/wt',
    model: 'sonnet',
    maxTurns: 40,
    exec,
  })
  return { exec, runIterate }
}

describe('createIterateRunner', () => {
  it('resumes on the PR branch, runs claude, and parses the RESULT', async () => {
    const { exec, runIterate } = runnerWith((cmd) =>
      cmd === 'claude' ? { code: 0, stdout: claudeJson('RESULT: updated'), stderr: '' } : { code: 0, stdout: '', stderr: '' },
    )
    const res = await runIterate(pr, 'rounder snout')
    expect(res).toEqual({ kind: 'updated' })

    // Fetched the PR branch and checked it out (not origin/main).
    expect(exec).toHaveBeenCalledWith('git', ['-C', '/repo', 'fetch', 'origin', pr.headRefName], { cwd: '/repo' })
    const wt = '/tmp/wt/iterate_emoji-request_capybara-2e227072'
    expect(exec).toHaveBeenCalledWith(
      'git',
      ['-C', '/repo', 'worktree', 'add', '-B', pr.headRefName, wt, `origin/${pr.headRefName}`],
      { cwd: '/repo' },
    )
    // Ran claude in the worktree with the iterate task.
    const claudeCall = exec.mock.calls.find((c) => c[0] === 'claude')!
    expect(claudeCall[2]).toEqual({ cwd: wt })
    // The task string is the arg after `-p`; it carries the feedback.
    expect(claudeCall[1][claudeCall[1].indexOf('-p') + 1]).toContain('rounder snout')
  })

  it('maps a non-zero claude exit to an error', async () => {
    const { runIterate } = runnerWith((cmd) =>
      cmd === 'claude' ? { code: 1, stdout: '', stderr: 'boom' } : { code: 0, stdout: '', stderr: '' },
    )
    expect(await runIterate(pr, 'x')).toEqual({ kind: 'error', message: expect.stringContaining('boom') })
  })

  it('always removes the worktree, even after an error', async () => {
    const { exec, runIterate } = runnerWith((cmd) =>
      cmd === 'claude' ? { code: 1, stdout: '', stderr: 'boom' } : { code: 0, stdout: '', stderr: '' },
    )
    await runIterate(pr, 'x')
    const wt = '/tmp/wt/iterate_emoji-request_capybara-2e227072'
    expect(exec).toHaveBeenCalledWith('git', ['-C', '/repo', 'worktree', 'remove', '--force', wt], { cwd: '/repo' })
  })
})
