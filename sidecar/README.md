# Emoji-request sidecar

Optional agent that turns emoji requests into pull requests, using the
`adding-a-critter-emoji` skill. **Not shipped in the app image.** See the design
in `docs/superpowers/plans/2026-07-10-emoji-request-sidecar.md`.

## What it does

Polls the app's owner-only request queue and, for each unhandled request, runs
a headless `claude -p` in a throwaway git worktree (with the
`adding-a-critter-emoji` skill auto-loaded) that draws an **original** emoji,
tests it, and opens a **PR** — copyright-unsafe/vague requests are **skipped, not
shipped**. It **never merges**; you review the PR.

| Module | Responsibility |
|---|---|
| `config` | validate env → config; refuse to start half-configured (deny by default) |
| `requestsClient` | read `?pending` requests / `PATCH` them handled (app API) |
| `task` | build the `claude -p` task, request **data-fenced** (injection-resistant) |
| `agentRunner` | isolate a worktree, run `claude -p`, read the `RESULT:` line |
| `parseResult` / `classify` | agent output → `AgentResult` → DB `outcome` |
| `dedupe` / `existingNames` | skip a request whose critter already exists |
| `parseIterate` / `prComments` | read `/iterate <feedback>` PR comments from allowlisted people; react (👀/🚀/😕) as dedup state, reply on the PR |
| `prState` / `reconcile` | `DELETE` a request once its PR is merged (accepted) |
| `processNext` | one loop step; `main` schedules it every `POLL_INTERVAL_MS` |

## Running it

Off by default. Set `ANTHROPIC_API_KEY`, `GH_TOKEN` (fine-grained PAT: this repo,
Contents + PRs, **no merge**), and reuse `WRITE_USER`/`WRITE_PASSWORD` in `.env`,
then:

    docker compose --profile sidecar up -d --build

Try `SIDECAR_DRY_RUN=1` first — it logs what it would process and touches
nothing. It **opens PRs, never merges**; each PR includes the render for review.

To iterate on an open sidecar PR, comment `/iterate <feedback>` (e.g. `/iterate
make the beak bigger`). Only logins in `SIDECAR_ALLOWED_COMMENTERS` (comma-
separated) can trigger it — empty means the feature is off (deny by default),
so a `/iterate` from anyone else is ignored.

## Recommended GitHub guardrails

The agent runs autonomously (`--dangerously-skip-permissions`) with the PAT in
its environment, so "never merge" is enforced at GitHub's edge, not just by the
prompt. Two one-time settings turn that instruction into a real boundary and cap
the blast radius if the token ever leaks:

- **Branch protection on `main`** — require a pull-request review before merge
  (and block direct pushes). The sidecar can open PRs but cannot merge or push to
  `main`, no matter what a prompt-injected run tries.
- **Scope the PAT to this one repo** — a fine-grained token limited to this
  repository, Contents + Pull requests **write** only (no admin, no other repos).
  A leak is then confined to this repo, and branch protection still blocks a merge.

Comment/request text is treated as untrusted **data** (data-fenced into the agent
prompt), and the sidecar redacts credentials from anything it logs.

## Dev

    pnpm install && pnpm test && pnpm typecheck
