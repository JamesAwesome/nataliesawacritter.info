import type { IterateComment, ReactionKind, SidecarPr } from './prComments'
import type { IterateResult } from './parseIterateResult'

export type IterateRunner = (pr: SidecarPr, feedback: string) => Promise<IterateResult>

/** The slice of prComments this orchestrator needs (structural — the real
 *  createPrComments satisfies it). */
export type CommentsPort = {
  listOpenPrs(): Promise<SidecarPr[]>
  listActionableComments(pr: SidecarPr): Promise<IterateComment[]>
  react(commentId: number, kind: ReactionKind): Promise<void>
  reply(prNumber: number, body: string): Promise<void>
}

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 80)

/** One step of the comment-iteration loop: for each open sidecar PR, run its
 *  actionable `/iterate` comments (allowlisted + not yet handled), bounded by a
 *  per-PR/cycle cap. Each comment is acknowledged with 👀 BEFORE the agent runs
 *  — that reaction is both the visible ack and the dedup record, so a crash
 *  mid-run can't re-trigger it — then marked 🚀 done / 😕 failed with a reply. */
export async function processComments(deps: {
  prComments: CommentsPort
  runIterate: IterateRunner
  perPrCap: number
  log?: (message: string) => void
}): Promise<{ ran: number }> {
  const log = deps.log ?? (() => {})
  let ran = 0

  for (const pr of await deps.prComments.listOpenPrs()) {
    const actionable = await deps.prComments.listActionableComments(pr)
    if (actionable.length === 0) continue

    const batch = actionable.slice(0, deps.perPrCap)
    if (actionable.length > batch.length) {
      log(`PR #${pr.number}: ${actionable.length} /iterate comments — running ${batch.length} this cycle (cap ${deps.perPrCap})`)
    }

    for (const c of batch) {
      // Acknowledge first: 👀 is the visible "picked it up" signal AND the dedup
      // record. Do it before the (long, crash-prone) run so a failure can't loop.
      await deps.prComments.react(c.id, 'seen')
      log(`iterating PR #${pr.number} for @${c.author}: "${oneLine(c.feedback)}"`)

      const res = await deps.runIterate(pr, c.feedback)
      if (res.kind === 'updated') {
        await deps.prComments.react(c.id, 'done')
        await deps.prComments.reply(pr.number, `🚀 Updated per your feedback — pushed to \`${pr.headRefName}\` and refreshed the render in the PR description.`)
        log(`updated PR #${pr.number}`)
      } else if (res.kind === 'refused') {
        await deps.prComments.react(c.id, 'failed')
        await deps.prComments.reply(pr.number, `😕 I couldn't apply that: ${res.reason}`)
        log(`refused PR #${pr.number}: ${res.reason}`)
      } else {
        await deps.prComments.react(c.id, 'failed')
        await deps.prComments.reply(pr.number, `😕 I hit an error applying that feedback — please try rephrasing.`)
        log(`error on PR #${pr.number}: ${res.message}`)
      }
      ran += 1
    }
  }

  return { ran }
}
