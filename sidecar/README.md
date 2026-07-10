# Emoji-request sidecar

Optional agent that turns emoji requests into pull requests, using the
`adding-a-critter-emoji` skill. **Not shipped in the app image.** See the design
in `docs/superpowers/plans/2026-07-10-emoji-request-sidecar.md`.

## Status: phase 2 — loop logic only

This package currently holds the **pure, tested** core; the agent that actually
writes the emoji is an injected seam (`AgentRunner`), mocked in tests. The real
`claude -p` wiring, the Dockerfile, and the `--profile sidecar` compose service
come in phase 3.

| Module | Responsibility |
|---|---|
| `requestsClient` | read `?pending` requests / `PATCH` them handled (app API) |
| `task` | build the `claude -p` task, with the request **data-fenced** (injection-resistant) |
| `parseResult` | read the agent's `RESULT:` line → an `AgentResult` |
| `classify` | map an `AgentResult` → the DB `outcome` (or leave unhandled to retry) |
| `dedupe` | skip a request whose critter already exists |
| `processNext` | one loop step: pick oldest pending → dedupe / run agent → mark handled |

## Dev

    pnpm install
    pnpm test
    pnpm typecheck
