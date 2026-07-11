# Plan: sidecar phase 5 — iterate via PR comments + reconcile merged requests

**Status:** proposed (planning only).
**Builds on:** the phase 1–4 sidecar (request → PR, `handled_at`/`pr_url`/`outcome`).

Two related "watch my own PRs" capabilities, both a new poll path alongside
`processNext`:

- **A. Iterate** — apply `/iterate <feedback>` PR comments to the emoji.
- **B. Reconcile** — when a request's PR is **merged**, remove the request
  ("remove accepted and merged").

## A. Iterate via PR comments

- **Trigger — explicit `/iterate`.** Act only on a PR comment beginning with
  `/iterate ` (the rest is the feedback). Casual review chatter ("lgtm") must
  not fire a token-spending run.
- **Authorization — allowlist of specific people.** Only act on comments whose
  author's GitHub login is in `SIDECAR_ALLOWED_COMMENTERS` (comma-separated
  logins, e.g. `JamesAwesome`). This is the primary guard: an `/iterate` comment
  from anyone else (a random collaborator, a compromised account, a bot) is
  ignored — its text never becomes agent instructions. **Deny by default:** if
  the allowlist is empty the comment-iteration path is disabled entirely (logged
  once). **The sidecar's own login is NOT excluded** — it usually runs with the
  operator's own PAT, so the reviewer commenting `/iterate` is the same account
  it authenticates as; excluding self would drop the very comments to act on. The
  loop guard is instead the `/iterate` prefix (the sidecar's own replies never
  start with it) plus reaction dedup below.
- **Discover.** List open PRs the sidecar authored (head branch
  `emoji-request/*`) via `gh`; for each, list issue comments; keep `/iterate`
  comments whose author is **allowlisted**.
- **Dedup/state — a GitHub reaction, no new DB.** Add 👀 when a comment is
  picked up, then ✅ (done) or ❌ (refused/failed). Skip any comment that
  already carries the sidecar's reaction. Status is visible right on the comment.
- **Run.** Worktree checked out on the **PR's head branch** (resume, not fresh
  off main); `claude -p` task = *"update this emoji per the feedback, re-render,
  commit, push this same branch"* with the feedback **data-fenced** (untrusted).
  The skill loads as always — **Rule 1 still refuses** "make it look exactly
  like <copyrighted character>." On success: push (PR updates in place) + reply
  with the new render + react ✅. On refuse/error: react ❌ + reply why.
- **Guards.** The `/iterate`-prefix trigger + reaction dedup are the loop guard
  (the sidecar's own replies never start with `/iterate`, and a 👀'd comment is
  skipped); **cap iterations per PR** (e.g. 5) to bound cost; single-flight.

## B. Reconcile merged requests ("remove accepted")

- For each request with `outcome = pr-opened` and a `pr_url`, check the PR via
  `gh pr view <url> --json state,mergedAt`:
  - **merged** → the emoji is accepted, so **`DELETE` the request** (it drops off
    the owner list). Loop closed: request → PR → merge → gone.
  - **closed, unmerged** → leave it (owner's call), or optionally mark
    `skipped-unclear`. *(Recommend: leave.)*
  - **open** → nothing.
- Optionally prune the merged branch (or rely on GitHub's auto-delete-on-merge).

## App-side changes

- **Iterate:** none — all via `gh`/GitHub.
- **Reconcile:** reuses the existing `GET` (all requests, includes `pr_url`) +
  `DELETE`. No schema change. (An alternative `merged` outcome instead of delete
  was considered, but the ask is *remove*, so `DELETE`.)

## New sidecar modules (TDD, injected seams like phase 2–3)

| Module | Responsibility |
|---|---|
| `prComments` | list sidecar PRs, list `/iterate` comments, add reactions, post replies (via `gh`/`gh api`; `exec` injected) |
| `parseIterate` | pure: is a comment an `/iterate`? extract the feedback |
| `iterateTask` | pure: build the resume `claude -p` task, feedback data-fenced |
| `agentRunner` (extend) | a "resume on existing branch" mode (checkout the PR branch instead of `-B` off origin/main) |
| `reconcile` | pure: given handled requests + a PR-state lookup → which ids to `DELETE` |
| `main` (extend) | each tick: `processNext` + `processComments` + `reconcile` |
| `config` (extend) | parse `SIDECAR_ALLOWED_COMMENTERS` → `allowedCommenters: string[]` |

## Safety

- **Allowlist of specific people** (`SIDECAR_ALLOWED_COMMENTERS`) — only listed
  GitHub logins can trigger an iteration; empty = feature off. This is the main
  authz control (untrusted comment text only becomes instructions from people
  you trust).
- Feedback **data-fenced** (injection defense-in-depth even for allowlisted
  authors), **Rule 1** copyright refusal, **never merges**, **ignore-own-comments**
  guard, **per-PR iteration cap**, single-flight.

## Testing

- **Unit:** `/iterate` parsing, reaction-based dedup, `iterateTask` fence,
  `reconcile` decisions (merged→delete, open→keep, closed→leave), the
  branch-resume command — all with `gh`/`exec`/`fetch` mocked.
- **Manual e2e (live):** comment `/iterate make the beak bigger` on a sidecar PR
  → PR updates + new render + ✅ reaction; merge a PR → the request disappears
  from the list.

## Open questions

1. **Trigger token** — `/iterate` (recommended) vs act on any owner comment.
2. **Closed-unmerged PR** — delete the request too, or leave it? (recommend leave.)
3. **Iteration cap** per PR (recommend 5).

## Suggested build order

1. `reconcile` (merged → delete) — smallest, immediately useful, no agent runs.
2. `prComments` + `parseIterate` + reaction dedup (read/mark, no agent yet).
3. `iterateTask` + `agentRunner` resume mode + wire `processComments` into `main`.
4. Manual e2e.
