import type { Exec } from './agentRunner'
import { parseIterate } from './parseIterate'

export type SidecarPr = { number: number; headRefName: string; url: string }
export type IterateComment = { id: number; prNumber: number; author: string; feedback: string; url: string }

/** Picked-up (👀), done (🚀), refused/failed (😕). GitHub only offers a fixed
 *  reaction set, so ✅/❌ map onto the nearest available content values. */
export type ReactionKind = 'seen' | 'done' | 'failed'
const REACTION_CONTENT: Record<ReactionKind, string> = { seen: 'eyes', done: 'rocket', failed: 'confused' }

/** Head branches the sidecar authors (see agentRunner.branchFor). */
const SIDECAR_BRANCH_PREFIX = 'emoji-request/'

type RawComment = { id: number; body: string; html_url: string; user: { login: string } }
type RawReaction = { content: string; user: { login: string } }

async function gh(exec: Exec, repoDir: string, args: string[]): Promise<string> {
  const res = await exec('gh', args, { cwd: repoDir })
  if (res.code !== 0) throw new Error(`gh ${args.join(' ')} failed (${res.code}): ${res.stderr.trim()}`)
  return res.stdout
}

/** The authenticated GitHub login — used to exclude the sidecar's own comments
 *  and to detect its own dedup reactions. */
export async function ghLogin(exec: Exec, repoDir: string): Promise<string> {
  return (await gh(exec, repoDir, ['api', 'user', '--jq', '.login'])).trim()
}

export function createPrComments(deps: {
  exec: Exec
  repoDir: string
  selfLogin: string
  allowedCommenters: string[]
  log?: (message: string) => void
}) {
  const { exec, repoDir, selfLogin, allowedCommenters } = deps
  const isAllowed = (login: string) => login !== selfLogin && allowedCommenters.includes(login)

  return {
    /** Open PRs on the sidecar's own emoji-request/* branches. */
    async listOpenPrs(): Promise<SidecarPr[]> {
      const out = await gh(exec, repoDir, ['pr', 'list', '--state', 'open', '--json', 'number,headRefName,url', '--limit', '100'])
      const rows = JSON.parse(out) as SidecarPr[]
      return rows.filter((r) => r.headRefName.startsWith(SIDECAR_BRANCH_PREFIX))
    },

    /** The `/iterate` comments on a PR that are authored by an allowlisted person
     *  and not yet handled (no prior sidecar reaction). Empty allowlist ⇒ off. */
    async listActionableComments(pr: SidecarPr): Promise<IterateComment[]> {
      if (allowedCommenters.length === 0) return []
      const raw = JSON.parse(
        await gh(exec, repoDir, ['api', '--paginate', `repos/{owner}/{repo}/issues/${pr.number}/comments`]),
      ) as RawComment[]

      const actionable: IterateComment[] = []
      for (const c of raw) {
        if (!isAllowed(c.user.login)) continue
        const feedback = parseIterate(c.body)
        if (feedback === null) continue
        if (await this.alreadyHandled(c.id)) continue
        actionable.push({ id: c.id, prNumber: pr.number, author: c.user.login, feedback, url: c.html_url })
      }
      return actionable
    },

    /** True if the sidecar has already reacted to this comment (dedup state,
     *  no DB — the reaction on the comment *is* the record). */
    async alreadyHandled(commentId: number): Promise<boolean> {
      const reactions = JSON.parse(
        await gh(exec, repoDir, ['api', '--paginate', `repos/{owner}/{repo}/issues/comments/${commentId}/reactions`]),
      ) as RawReaction[]
      return reactions.some((r) => r.user.login === selfLogin)
    },

    async react(commentId: number, kind: ReactionKind): Promise<void> {
      await gh(exec, repoDir, [
        'api',
        '--method',
        'POST',
        `repos/{owner}/{repo}/issues/comments/${commentId}/reactions`,
        '-f',
        `content=${REACTION_CONTENT[kind]}`,
      ])
    },

    async reply(prNumber: number, body: string): Promise<void> {
      await gh(exec, repoDir, ['pr', 'comment', String(prNumber), '--body', body])
    },
  }
}

export type PrComments = ReturnType<typeof createPrComments>
