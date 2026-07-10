import { describe, expect, it, vi } from 'vitest'
import { prStateOf } from './prState'
import type { ExecResult } from './agentRunner'

const exec = (result: ExecResult) => vi.fn(async (): Promise<ExecResult> => result)

describe('prStateOf', () => {
  it('maps gh state to a PrState', async () => {
    expect(await prStateOf(exec({ code: 0, stdout: '{"state":"MERGED"}', stderr: '' }), 'u')).toBe('merged')
    expect(await prStateOf(exec({ code: 0, stdout: '{"state":"OPEN"}', stderr: '' }), 'u')).toBe('open')
    expect(await prStateOf(exec({ code: 0, stdout: '{"state":"CLOSED"}', stderr: '' }), 'u')).toBe('closed')
  })

  it('is unknown on non-zero exit or unparseable output', async () => {
    expect(await prStateOf(exec({ code: 1, stdout: '', stderr: 'nope' }), 'u')).toBe('unknown')
    expect(await prStateOf(exec({ code: 0, stdout: 'not json', stderr: '' }), 'u')).toBe('unknown')
  })

  it('queries gh with the PR url', async () => {
    const e = exec({ code: 0, stdout: '{"state":"OPEN"}', stderr: '' })
    await prStateOf(e, 'https://github.com/o/r/pull/3')
    expect(e).toHaveBeenCalledWith('gh', ['pr', 'view', 'https://github.com/o/r/pull/3', '--json', 'state'], { cwd: '.' })
  })
})
