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
| `processNext` | one loop step; `main` schedules it every `POLL_INTERVAL_MS` |

## Running it

Off by default. Set `ANTHROPIC_API_KEY`, `GH_TOKEN` (fine-grained PAT: this repo,
Contents + PRs, **no merge**), and reuse `WRITE_USER`/`WRITE_PASSWORD` in `.env`,
then:

    docker compose --profile sidecar up -d --build

Try `SIDECAR_DRY_RUN=1` first — it logs what it would process and touches
nothing. It **opens PRs, never merges**; each PR includes the render for review.

## Dev

    pnpm install && pnpm test && pnpm typecheck
