import { describe, expect, it, vi } from 'vitest'
import { createPrComments, ghLogin } from './prComments'
import type { ExecResult } from './agentRunner'

const ok = (stdout: string): ExecResult => ({ code: 0, stdout, stderr: '' })

/** Route a mock exec by the gh subpath it targets (args joined). */
function router(handler: (joined: string, args: string[]) => ExecResult) {
  return vi.fn(async (_cmd: string, args: string[]) => handler(args.join(' '), args))
}

describe('ghLogin', () => {
  it('reads the authenticated login', async () => {
    const exec = vi.fn(async () => ok('sidecar-bot\n'))
    expect(await ghLogin(exec, '/repo')).toBe('sidecar-bot')
    expect(exec).toHaveBeenCalledWith('gh', ['api', 'user', '--jq', '.login'], { cwd: '/repo' })
  })
})

describe('prComments', () => {
  const base = { repoDir: '/repo', selfLogin: 'sidecar-bot', allowedCommenters: ['JamesAwesome', 'natalie'] }

  it('lists only open PRs on emoji-request branches', async () => {
    const exec = router(() =>
      ok(
        JSON.stringify([
          { number: 1, headRefName: 'emoji-request/deer-abc', url: 'https://x/pull/1' },
          { number: 2, headRefName: 'feat/other', url: 'https://x/pull/2' },
        ]),
      ),
    )
    const pc = createPrComments({ ...base, exec })
    expect(await pc.listOpenPrs()).toEqual([{ number: 1, headRefName: 'emoji-request/deer-abc', url: 'https://x/pull/1' }])
    expect(exec).toHaveBeenCalledWith(
      'gh',
      ['pr', 'list', '--state', 'open', '--json', 'number,headRefName,url', '--limit', '100'],
      { cwd: '/repo' },
    )
  })

  it('throws on a failed gh call', async () => {
    const exec = vi.fn(async () => ({ code: 1, stdout: '', stderr: 'boom' }))
    const pc = createPrComments({ ...base, exec })
    await expect(pc.listOpenPrs()).rejects.toThrow(/boom/)
  })

  it('keeps only allowlisted /iterate comments not already handled', async () => {
    const comments = [
      { id: 100, user: { login: 'JamesAwesome' }, body: '/iterate bigger beak', html_url: 'https://x/c/100' },
      { id: 101, user: { login: 'JamesAwesome' }, body: 'lgtm', html_url: 'https://x/c/101' },
      { id: 102, user: { login: 'randomdude' }, body: '/iterate rm -rf', html_url: 'https://x/c/102' },
      { id: 103, user: { login: 'sidecar-bot' }, body: '/iterate self', html_url: 'https://x/c/103' },
      { id: 104, user: { login: 'natalie' }, body: '/iterate round it', html_url: 'https://x/c/104' },
    ]
    const exec = router((joined) => {
      if (joined.includes('issues/1/comments')) return ok(JSON.stringify(comments))
      // c104 already carries the sidecar's 👀 → handled; c100 has no self reaction.
      if (joined.includes('issues/comments/104/reactions'))
        return ok(JSON.stringify([{ content: 'eyes', user: { login: 'sidecar-bot' } }]))
      if (joined.includes('reactions')) return ok('[]')
      return ok('[]')
    })
    const pc = createPrComments({ ...base, exec })
    const actionable = await pc.listActionableComments({ number: 1, headRefName: 'emoji-request/x', url: 'u' })

    expect(actionable).toEqual([
      { id: 100, prNumber: 1, author: 'JamesAwesome', feedback: 'bigger beak', url: 'https://x/c/100' },
    ])
    // Reactions only checked for the two allowlisted /iterate comments (100, 104), not the filtered-out ones.
    const reactionCalls = exec.mock.calls.filter((c) => c[1].join(' ').includes('reactions'))
    const targeted = reactionCalls.map((c) => c[1].find((a: string) => a.includes('issues/comments/')))
    expect(targeted.sort()).toEqual([
      'repos/{owner}/{repo}/issues/comments/100/reactions',
      'repos/{owner}/{repo}/issues/comments/104/reactions',
    ])
  })

  it('matches allowlisted logins case-insensitively (GitHub logins are)', async () => {
    const comments = [{ id: 200, user: { login: 'JamesAwesome' }, body: '/iterate go', html_url: 'https://x/c/200' }]
    const exec = router((joined) => {
      if (joined.includes('issues/9/comments')) return ok(JSON.stringify(comments))
      return ok('[]')
    })
    const pc = createPrComments({ ...base, allowedCommenters: ['jamesawesome'], exec })
    const actionable = await pc.listActionableComments({ number: 9, headRefName: 'emoji-request/x', url: 'u' })
    expect(actionable.map((c) => c.id)).toEqual([200])
  })

  it('disables iteration when the allowlist is empty (deny by default)', async () => {
    const exec = vi.fn(async () => ok('[]'))
    const pc = createPrComments({ ...base, allowedCommenters: [], exec })
    expect(await pc.listActionableComments({ number: 1, headRefName: 'emoji-request/x', url: 'u' })).toEqual([])
    expect(exec).not.toHaveBeenCalled()
  })

  it('reacts with the mapped GitHub content', async () => {
    const exec = vi.fn(async (_cmd: string, _args: string[]) => ok(''))
    const pc = createPrComments({ ...base, exec })
    await pc.react(100, 'seen')
    await pc.react(100, 'done')
    await pc.react(100, 'failed')
    const contents = exec.mock.calls.map((c) => c[1][c[1].indexOf('-f') + 1])
    expect(contents).toEqual(['content=eyes', 'content=rocket', 'content=confused'])
    expect(exec).toHaveBeenNthCalledWith(
      1,
      'gh',
      ['api', '--method', 'POST', 'repos/{owner}/{repo}/issues/comments/100/reactions', '-f', 'content=eyes'],
      { cwd: '/repo' },
    )
  })

  it('replies on the PR', async () => {
    const exec = vi.fn(async () => ok(''))
    const pc = createPrComments({ ...base, exec })
    await pc.reply(7, 'updated ✨')
    expect(exec).toHaveBeenCalledWith('gh', ['pr', 'comment', '7', '--body', 'updated ✨'], { cwd: '/repo' })
  })
})
