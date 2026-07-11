import { describe, expect, it, vi } from 'vitest'
import { processComments, type CommentsPort } from './processComments'
import type { IterateComment, SidecarPr } from './prComments'
import type { IterateResult } from './parseIterateResult'

const pr: SidecarPr = { number: 12, headRefName: 'emoji-request/capybara-2e227072', url: 'https://x/pull/12' }
const comment = (id: number): IterateComment => ({ id, prNumber: 12, author: 'JamesAwesome', feedback: `fb${id}`, url: `u${id}` })

function port(overrides: Partial<CommentsPort> & { comments: IterateComment[]; events?: string[] }): CommentsPort {
  const ev = overrides.events ?? []
  return {
    listOpenPrs: vi.fn(async () => [pr]),
    listActionableComments: vi.fn(async () => overrides.comments),
    react: vi.fn(async (id: number, kind) => void ev.push(`react:${id}:${kind}`)),
    reply: vi.fn(async (n: number, body: string) => void ev.push(`reply:${n}:${body.slice(0, 12)}`)),
    ...overrides,
  }
}

describe('processComments', () => {
  it('acknowledges (👀) BEFORE running the agent, then reacts done + replies on success', async () => {
    const events: string[] = []
    const pc = port({ comments: [comment(100)], events })
    const runIterate = vi.fn(async (): Promise<IterateResult> => {
      events.push('run')
      return { kind: 'updated' }
    })

    const res = await processComments({ prComments: pc, runIterate, perPrCap: 5 })

    expect(res).toEqual({ ran: 1 })
    expect(events).toEqual(['react:100:seen', 'run', 'react:100:done', expect.stringMatching(/^reply:12:/)])
    expect(runIterate).toHaveBeenCalledWith(pr, 'fb100')
  })

  it('notes the model in the reply and pushes an ntfy on a successful update', async () => {
    const pc = port({ comments: [comment(100)] })
    const notifyUpdated = vi.fn()
    await processComments({
      prComments: pc,
      runIterate: vi.fn(async (): Promise<IterateResult> => ({ kind: 'updated' })),
      perPrCap: 5,
      model: 'sonnet',
      notifyUpdated,
    })
    const body = (pc.reply as ReturnType<typeof vi.fn>).mock.calls[0][1] as string
    expect(body).toMatch(/Model: sonnet/)
    expect(notifyUpdated).toHaveBeenCalledWith(12, 'https://x/pull/12')
  })

  it('does not push on a refusal', async () => {
    const pc = port({ comments: [comment(101)] })
    const notifyUpdated = vi.fn()
    await processComments({
      prComments: pc,
      runIterate: vi.fn(async (): Promise<IterateResult> => ({ kind: 'refused', reason: 'nope' })),
      perPrCap: 5,
      notifyUpdated,
    })
    expect(notifyUpdated).not.toHaveBeenCalled()
  })

  it('reacts failed + replies with the reason on refusal', async () => {
    const events: string[] = []
    const pc = port({ comments: [comment(101)], events })
    const runIterate = vi.fn(async (): Promise<IterateResult> => ({ kind: 'refused', reason: 'wants a logo' }))
    await processComments({ prComments: pc, runIterate, perPrCap: 5 })
    expect(events).toContain('react:101:seen')
    expect(events).toContain('react:101:failed')
    expect((pc.reply as ReturnType<typeof vi.fn>).mock.calls[0][1]).toMatch(/wants a logo/)
  })

  it('reacts failed on an agent error (comment already ack’d, no auto-retry)', async () => {
    const pc = port({ comments: [comment(102)] })
    const runIterate = vi.fn(async (): Promise<IterateResult> => ({ kind: 'error', message: 'timeout' }))
    await processComments({ prComments: pc, runIterate, perPrCap: 5 })
    expect(pc.react).toHaveBeenCalledWith(102, 'seen')
    expect(pc.react).toHaveBeenCalledWith(102, 'failed')
  })

  it('caps how many it runs per PR per cycle', async () => {
    const pc = port({ comments: [comment(1), comment(2), comment(3)] })
    const runIterate = vi.fn(async (): Promise<IterateResult> => ({ kind: 'updated' }))
    const res = await processComments({ prComments: pc, runIterate, perPrCap: 2 })
    expect(res).toEqual({ ran: 2 })
    expect(runIterate).toHaveBeenCalledTimes(2)
  })

  it('does nothing when no PR has actionable comments', async () => {
    const pc = port({ comments: [] })
    const runIterate = vi.fn()
    const res = await processComments({ prComments: pc, runIterate, perPrCap: 5 })
    expect(res).toEqual({ ran: 0 })
    expect(runIterate).not.toHaveBeenCalled()
  })
})
