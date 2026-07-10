# Design: deploy nataliesawacritter.info on merge (self-hosted runner → LAN host)

**Status:** approved design (security-reviewed). Ready for an implementation plan.
**Date:** 2026-07-10

## Goal

When a change lands on `main`, redeploy the app containers on the LAN host that
serves nataliesawacritter.info — automatically, but behind a manual approval, and
without disturbing the host's `.env`, `pgdata` volume, or profile choices.

## Topology

- **App host** — a LAN machine running the stack via `docker compose` (app +
  Postgres, optional `tunnel`/`sidecar` profiles), exposed through a Cloudflare
  tunnel. It already has a **git checkout** of this repo; today deploys are manual
  (`git pull && docker compose up -d --build`). Its `.env` (all prod secrets) and
  `pgdata` volume live here and must stay untouched by CI.
- **Runner** — a self-hosted GitHub Actions runner on a **separate** LAN machine
  (like led-ticker). It reaches the app host over SSH. **Only the deploy job runs
  on it** — all PR/CI jobs stay on GitHub-hosted runners, so untrusted fork-PR
  code never executes on the LAN runner.

```
merge to main ─▶ CI (GitHub-hosted: app, sidecar, docker)
                    │ green
                    ▼
          deploy job (self-hosted)  ── needs approval (production env) ──▶
                    │ approved
                    ▼
        ssh ──▶ app host: git checkout <sha> ; docker compose up -d --build --wait
                    │ unhealthy?
                    └─▶ ERR trap: roll back to previous commit, notify
```

## Trigger & gating

A new `deploy` job appended to `.github/workflows/ci.yml`:

- `runs-on: self-hosted`
- `needs: [app, sidecar, docker]` — only runs if CI is green.
- `if: github.event_name == 'push' && github.ref == 'refs/heads/main'` — never on
  PRs, never on branches.
- `environment: production` — a GitHub Environment with the **owner as required
  reviewer**; the merge queues the deploy and it pauses until approved. Deploy
  secrets are scoped to this environment, so no other job (and no PR job) can read
  them.
- `concurrency: { group: deploy-prod, cancel-in-progress: false }` — deploys
  serialize; an in-flight deploy is never interrupted.
- `permissions: contents: read` — the job authenticates via SSH, not
  `GITHUB_TOKEN`; give the token nothing.
- `timeout-minutes: 20` — a hung `--wait` can't pin the runner indefinitely.
- Actions used by the job are **SHA-pinned** (the rest of `ci.yml` uses floating
  tags; the deploy job sits next to secrets, so pin it).

## Connection & secrets

Secrets, scoped to the `production` environment:

| Secret | Purpose |
|---|---|
| `DEPLOY_SSH_KEY` | dedicated ed25519 **private** key (deploy-only keypair) |
| `DEPLOY_HOST` | app host LAN address |
| `DEPLOY_USER` | SSH user on the host (in the `docker` group) |
| `DEPLOY_KNOWN_HOSTS` | the host's SSH public-key line — real host verification |
| `DEPLOY_PATH` | the repo checkout dir on the host |

The job:
1. `umask 077`; write the key and known_hosts to a **job-temp path** (not `~/.ssh`).
2. Run: `ssh -i <key> -o UserKnownHostsFile=<kh> "$DEPLOY_USER@$DEPLOY_HOST" 'bash -s -- "$SHA"' < scripts/deploy.sh` — where `SHA` is passed via `env: SHA: ${{ github.sha }}` (not interpolated straight into the shell line). Streaming the script means the deploy logic is always the merged commit's.
3. Remove the key/known_hosts in an `if: always()` step. No `set -x` around the SSH call.

**Host-side key hardening (must-fix H2).** The deploy public key in the host's
`~/.ssh/authorized_keys` is pinned to a **forced command** that runs only the
deploy wrapper, with `no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty`:

```
command="/home/deploy/nataliesawacritter.info/scripts/deploy-forced.sh",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty ssh-ed25519 AAAA... deploy@ci
```

A stolen key can then only trigger a deploy of a real `main` SHA — never arbitrary
root commands. `deploy-forced.sh` reads the streamed script/SHA from `$SSH_ORIGINAL_COMMAND`
guardedly (or, simpler, ignores stdin and just runs the checked-in `scripts/deploy.sh`
against `origin/main`'s tip after re-validating it's the SHA the runner asserts).

> Design note: the forced-command wrapper is the security boundary. The exact
> handoff (stream vs. host-local script) is a plan-level detail; either way the
> effective privilege of the key is "run the deploy," not "run anything."

## The deploy script (`scripts/deploy.sh`, checked in, runs on host)

```bash
#!/usr/bin/env bash
set -euo pipefail

SHA="${1:?usage: deploy.sh <40-hex-commit-sha>}"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "refusing: not a commit sha: $SHA" >&2; exit 1; }

cd "${DEPLOY_PATH:?DEPLOY_PATH unset}"
git status --porcelain | grep -q . && { echo "refusing: host checkout is dirty" >&2; exit 1; }

PREV=$(git rev-parse HEAD)                      # for rollback
rollback() {
  echo "::deploy:: unhealthy — rolling back to $PREV" >&2
  git checkout --force "$PREV"
  docker compose up -d --build --wait --wait-timeout 120 --remove-orphans || true
  # best-effort notify (see below)
}
trap 'rollback' ERR

git fetch --prune origin
git checkout --force "$SHA"                     # deploy the EXACT validated commit
docker compose up -d --build --wait --wait-timeout 120 --remove-orphans
```

- Deploys the exact commit CI validated (`github.sha`), never a racy "latest main".
- Refuses to run on a **dirty host checkout** or a non-SHA argument (fail closed).
- `COMPOSE_PROFILES` is read from the host `.env`, so tunnel/sidecar scope stays the
  host's decision.
- **Auto-rollback**: an unhealthy new build trips the `ERR` trap, which restores the
  previous commit **with the same `--wait`** (so rollback is confirmed healthy too);
  `set -e` still propagates the original failure, so the job ends **red** and you're
  notified — no silent revert.

## Health gate

`--wait` needs healthchecks, so add to `compose.yml`:

- **app** — `HEALTHCHECK` hitting `/api/health` (already reports DB connectivity),
  using node's built-in `fetch`:
  ```yaml
  healthcheck:
    test: ["CMD", "node", "-e", "fetch('http://localhost:8080/api/health').then(r=>{process.exit(r.ok?0:1)}).catch(()=>process.exit(1))"]
    interval: 10s
    timeout: 3s
    retries: 5
    start_period: 20s
  ```
- **postgres** — `pg_isready`; app gets `depends_on: { postgres: { condition: service_healthy } }`.

"Deploy succeeded" now means *actually serving + DB-connected*, not "container started."
(This also closes the long-deferred app-healthcheck item.)

## Notification

On deploy **failure/rollback**, send an ntfy ping (reuse the pattern the app/sidecar
already use for emoji requests) so a bad deploy or an auto-rollback is visible, not
silent. Success pings optional. Kept minimal; a failure that also fails to notify
still leaves the job red.

## Prerequisite: branch protection (must-fix H1)

The "only validated code deploys" model assumes `main` can't receive unreviewed or
rewritten commits — but `main` is **currently unprotected**. Before enabling deploy:

- Require a **pull request** before merging to `main`.
- Require the CI checks as **required status checks** (the `app`/`sidecar`/`docker`
  jobs, or a `ci-passed` rollup like led-ticker's).
- **Block force-push and branch deletion.**
- Consider "require branches up to date" to close the racy-main / force-push-after-CI
  window.

Without this, the environment reviewer approves the *deploy run* but not the *code*.

## Runner hardening

- Keep the runner **deploy-only** — do not migrate CI jobs onto it.
- Prefer an **ephemeral** runner (fresh VM / `--ephemeral`) so a compromise doesn't
  persist.
- Firewall its egress/LAN reach to just the app host's SSH port.
- Before this repo is ever made public: Actions → **"Require approval for all outside
  collaborators"** (same caveat led-ticker documents).

## Security controls summary (from review)

Must-fix: **branch protection** (H1), **forced-command deploy key** (H2). Folded-in
nice-to-haves: SHA-format validation + `env:`-passed SHA; deploy-dirty/`^[0-9a-f]{40}$`
refusals; `permissions: contents: read`; `timeout-minutes`; SHA-pinned actions;
`umask 077` temp secret files cleaned in `always()`; rollback `--wait-timeout`; ntfy
on failure; host `.env` `600`; app Dockerfile base pinned (tag, ideally digest).

Already sound (no change): only the deploy job is self-hosted (fork code never
reaches the LAN runner); push+main+green-`needs`+manual-approval gating; known_hosts
verification (no blind TOFU); env-scoped secrets withheld from PR jobs; serialized
`concurrency`; healthcheck-gated `--wait`; prod secrets stay in the host `.env`.

## Deliverables

**Code (this repo):**
- `.github/workflows/ci.yml` — new `deploy` job (self-hosted, gated, environment, hardened).
- `scripts/deploy.sh` — host-side deploy + auto-rollback (above).
- `compose.yml` — app + postgres healthchecks; app `depends_on` healthy postgres.
- `app/Dockerfile` — pin the base image (tag/digest) if not already.
- `README.md` — deploy section + the one-time setup checklist below.

**One-time manual setup (documented, not code):**
1. Branch-protect `main` (PR + required checks + no force-push).
2. Create the `production` Environment with the owner as required reviewer.
3. Add the five `DEPLOY_*` secrets to that environment.
4. On the host: create the deploy user (in `docker` group), install the forced-command
   `authorized_keys` entry, `chmod 600` the `.env`, confirm the checkout is clean and
   deploy-only.
5. Provision/confirm the self-hosted runner (ideally ephemeral, egress-firewalled).

## Testing / verification

- `deploy.sh` logic is shell — validate the SHA-format guard, dirty-checkout refusal,
  and rollback path with a dry-run harness (`DEPLOY_PATH` = a throwaway clone;
  substitute a fake `docker` on PATH that records args / can be told to "fail health"
  so the trap fires). No real containers needed for the unit check.
- Healthchecks: verify `docker compose up -d --wait` goes healthy on a good build and
  times out (non-zero) on a deliberately broken one, locally.
- First real deploy: watch the approval gate pause, approve, confirm the exact SHA is
  checked out and the site stays up; then force one unhealthy build to confirm
  auto-rollback + red job + ntfy.

## Out of scope / future

- Registry-based deploys (build-in-CI → push → pull) with rollback-by-tag — a future
  upgrade if host build time or reproducibility becomes a concern.
- Zero-downtime / blue-green — unnecessary for a personal app; brief restart is fine.
- Auto-deploy without approval — explicitly rejected; the approval gate stays.
