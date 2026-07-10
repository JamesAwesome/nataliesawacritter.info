import { describe, expect, it, vi } from 'vitest'
import { branchFor, createAgentRunner, type ExecResult } from './agentRunner'

const request = { id: 'abcdef12-3456-7890-abcd-ef1234567890', name: 'Hedgehog', note: null }

describe('branchFor', () => {
  it('slugs the name and appends the id prefix', () => {
    expect(branchFor(request)).toBe('emoji-request/hedgehog-abcdef12')
    expect(branchFor({ ...request, name: 'Red Panda!' })).toBe('emoji-request/red-panda-abcdef12')
  })
})

describe('createAgentRunner', () => {
  function runner(claude: ExecResult) {
    const exec = vi.fn(async (cmd: string, _args: string[]): Promise<ExecResult> =>
      cmd === 'claude' ? claude : { code: 0, stdout: '', stderr: '' },
    )
    const run = createAgentRunner({ repoDir: '/repo', worktreesDir: '/wt', model: 'sonnet', maxTurns: 30, exec })
    return { run, exec }
  }

  it('isolates in a worktree, runs claude, parses the RESULT, and cleans up', async () => {
    const { run, exec } = runner({
      code: 0,
      stdout: JSON.stringify({ result: 'made it!\nRESULT: pr-opened https://github.com/o/r/pull/9' }),
      stderr: '',
    })
    const res = await run(request)
    expect(res).toEqual({ kind: 'pr-opened', prUrl: 'https://github.com/o/r/pull/9' })

    const calls = exec.mock.calls.map((c) => `${c[0]} ${(c[1] as string[]).join(' ')}`)
    expect(calls.some((c) => c.startsWith('git -C /repo fetch origin main'))).toBe(true)
    expect(calls.some((c) => c.includes('worktree add -B emoji-request/hedgehog-abcdef12'))).toBe(true)
    expect(calls.some((c) => c.startsWith('claude -p'))).toBe(true)
    expect(calls.some((c) => c.includes('worktree remove --force'))).toBe(true)
  })

  it('returns an error when claude exits non-zero', async () => {
    const { run } = runner({ code: 1, stdout: '', stderr: 'boom' })
    expect((await run(request)).kind).toBe('error')
  })

  it('maps a skip RESULT from the agent', async () => {
    const { run } = runner({ code: 0, stdout: JSON.stringify({ result: 'RESULT: skipped-copyright' }), stderr: '' })
    expect(await run(request)).toEqual({ kind: 'skipped-copyright' })
  })
})
