# Deploy-on-merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redeploy nataliesawacritter.info on merge to `main` via a self-hosted, approval-gated GitHub Actions job that SSHes to the LAN host and rebuilds the compose stack, with a health gate and auto-rollback.

**Architecture:** A `deploy` job in `ci.yml` (`runs-on: self-hosted`, only on `push`+`main`, `needs` green CI, behind a `production` Environment with a required reviewer) SSHes to the app host and hands it the exact validated commit SHA. A host-local forced-command wrapper (set up manually, out of scope here) runs the checked-in `scripts/deploy.sh <sha>`, which checks out that commit and runs `docker compose up -d --build --wait`; an unhealthy build trips an `ERR` trap that rolls back to the previous commit. `--wait` is made meaningful by an app healthcheck.

**Tech Stack:** GitHub Actions (self-hosted runner), OpenSSH, Bash, Docker Compose v2, Node 26 (healthcheck uses built-in `fetch`).

**Spec:** `docs/superpowers/specs/2026-07-10-deploy-on-merge-design.md`

## Global Constraints

- Only the `deploy` job runs `self-hosted`; all other CI jobs stay GitHub-hosted.
- Deploy runs **only** on `github.event_name == 'push' && github.ref == 'refs/heads/main'`, gated by the `production` Environment (manual approval). Never on PRs; never auto-merge.
- Deploy the **exact** `github.sha` — never a racy "latest main".
- Deploy secrets live only in the `production` Environment: `DEPLOY_SSH_KEY`, `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_KNOWN_HOSTS`, `DEPLOY_PATH`.
- The runner sends **only the SHA** as the SSH remote command; the host forced-command wrapper supplies the script path. `deploy.sh` fails closed on a non-40-hex arg or a dirty host checkout.
- SHA-pin any actions used by deploy-adjacent jobs. Shell scripts must pass `bash -n`.
- `COMPOSE_PROFILES` is owned by the host `.env`; the deploy job must not pass profile flags.

## Already satisfied (no task needed)

- **postgres healthcheck** + app `depends_on: { postgres: { condition: service_healthy } }` — present in `compose.yml`.
- **Dockerfile base pinned** — `app/Dockerfile` uses `node:26.4.0-slim` (tag-pinned patch version). Digest-pinning is optional and out of scope.
- **Branch protection on `main`** — done by the owner (must-fix H1).
- **Forced-command deploy key + `production` Environment + secrets** — manual host/GitHub setup done by the owner (must-fix H2); see the spec's setup checklist. This plan produces the code those steps point at.

## File Structure

- **Create `scripts/deploy.sh`** — host-side deploy + auto-rollback. Single responsibility: given a SHA, safely (re)deploy or roll back.
- **Create `scripts/deploy.test.sh`** — self-contained Bash test harness for `deploy.sh` (fake `docker` on PATH + throwaway git repo). No Docker/network needed.
- **Modify `compose.yml`** — add an `app` service healthcheck so `--wait` means "serving + DB-connected".
- **Modify `.github/workflows/ci.yml`** — add a `deploy-script` job (runs the harness) and the `deploy` job (SSH).
- **Modify `README.md`** — deploy section + one-time setup checklist.

---

### Task 1: `scripts/deploy.sh` + test harness

**Files:**
- Create: `scripts/deploy.sh`
- Test: `scripts/deploy.test.sh`

**Interfaces:**
- Produces: `scripts/deploy.sh` invoked as `deploy.sh <40-hex-sha>` with env `DEPLOY_PATH` set. Exit codes: `0` success, `1` deploy failed (rolled back), `2` bad SHA arg, `3` dirty checkout. The host forced-command wrapper (manual setup) calls it; the `deploy` job (Task 3) triggers that wrapper over SSH.

- [ ] **Step 1: Write the failing test harness**

Create `scripts/deploy.test.sh`:

```bash
#!/usr/bin/env bash
# Unit tests for deploy.sh: a fake `docker` on PATH records calls and can be told
# to fail the Nth `up`; a throwaway git repo stands in for the host checkout.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DEPLOY="$HERE/deploy.sh"
fails=0
check() { if [ "$1" = "$2" ]; then echo "ok: $3"; else echo "FAIL: $3 (want '$2' got '$1')"; fails=$((fails+1)); fi; }

setup() {
  TMP="$(mktemp -d)"
  mkdir -p "$TMP/bin"
  cat > "$TMP/bin/docker" <<'FAKE'
#!/usr/bin/env bash
echo "$@" >> "$FAKE_DOCKER_LOG"
n=$(( $(cat "$FAKE_DOCKER_COUNT") + 1 )); echo "$n" > "$FAKE_DOCKER_COUNT"
if [ "${FAKE_DOCKER_FAIL_ON:-0}" = "$n" ]; then exit 1; fi
exit 0
FAKE
  chmod +x "$TMP/bin/docker"
  git init -q --bare "$TMP/origin.git"
  git clone -q "$TMP/origin.git" "$TMP/work"
  git -C "$TMP/work" -c user.email=t@t -c user.name=t commit -q --allow-empty -m prev
  PREV_SHA=$(git -C "$TMP/work" rev-parse HEAD)
  git -C "$TMP/work" -c user.email=t@t -c user.name=t commit -q --allow-empty -m target
  TARGET_SHA=$(git -C "$TMP/work" rev-parse HEAD)
  git -C "$TMP/work" push -q origin HEAD:main
  git -C "$TMP/work" checkout -q "$PREV_SHA"   # host starts deployed at PREV
  export FAKE_DOCKER_LOG="$TMP/docker.log"; : > "$FAKE_DOCKER_LOG"
  export FAKE_DOCKER_COUNT="$TMP/docker.count"; echo 0 > "$FAKE_DOCKER_COUNT"
  export PATH="$TMP/bin:$PATH"
  export DEPLOY_PATH="$TMP/work"
}
teardown() { rm -rf "$TMP"; unset FAKE_DOCKER_FAIL_ON; }

setup
bash "$DEPLOY" "not-a-sha" >/dev/null 2>&1; check "$?" "2" "rejects a non-sha arg"
teardown

setup
echo x > "$DEPLOY_PATH/uncommitted"; git -C "$DEPLOY_PATH" add -A
bash "$DEPLOY" "$TARGET_SHA" >/dev/null 2>&1; check "$?" "3" "refuses a dirty checkout"
teardown

setup
bash "$DEPLOY" "$TARGET_SHA" >/dev/null 2>&1; rc=$?
check "$rc" "0" "happy path exits 0"
check "$(git -C "$DEPLOY_PATH" rev-parse HEAD)" "$TARGET_SHA" "checked out the target sha"
check "$(grep -c 'up -d --build --wait' "$FAKE_DOCKER_LOG")" "1" "ran compose up once"
teardown

setup
FAKE_DOCKER_FAIL_ON=1 bash "$DEPLOY" "$TARGET_SHA" >/dev/null 2>&1; rc=$?
check "$rc" "1" "unhealthy build exits non-zero"
check "$(git -C "$DEPLOY_PATH" rev-parse HEAD)" "$PREV_SHA" "rolled back to the previous sha"
check "$(grep -c 'up -d --build --wait' "$FAKE_DOCKER_LOG")" "2" "built, then rebuilt on rollback"
teardown

if [ "$fails" = 0 ]; then echo "ALL PASS"; exit 0; else echo "$fails FAILED"; exit 1; fi
```

- [ ] **Step 2: Run the harness to verify it fails**

Run: `bash scripts/deploy.test.sh`
Expected: FAIL — `scripts/deploy.sh` does not exist yet (non-zero exit; the checks report failures).

- [ ] **Step 3: Write `scripts/deploy.sh`**

Create `scripts/deploy.sh`:

```bash
#!/usr/bin/env bash
# Host-side deploy. Given the CI-validated commit SHA, check it out and (re)build
# the compose stack, waiting for health; on an unhealthy build, roll back to the
# previously-deployed commit. Invoked (via the forced-command wrapper) as:
#   deploy.sh <40-hex-sha>     with DEPLOY_PATH pointing at the host checkout.
# COMPOSE_PROFILES comes from the host .env — do not pass profile flags here.
set -euo pipefail

SHA="${1:-}"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "deploy: refusing — not a 40-hex commit sha: '$SHA'" >&2; exit 2; }

: "${DEPLOY_PATH:?deploy: DEPLOY_PATH is not set}"
cd "$DEPLOY_PATH"

if [ -n "$(git status --porcelain)" ]; then
  echo "deploy: refusing — host checkout is dirty ($DEPLOY_PATH)" >&2
  exit 3
fi

up() { docker compose up -d --build --wait --wait-timeout 120 --remove-orphans; }

PREV="$(git rev-parse HEAD)"
rollback() {
  trap - ERR                                   # don't re-enter on a rollback failure
  echo "deploy: build unhealthy — rolling back to $PREV" >&2
  git checkout --force "$PREV" || true
  up || echo "deploy: WARNING — rollback build did not become healthy" >&2
  exit 1
}
trap rollback ERR

git fetch --prune origin
git checkout --force "$SHA"
echo "deploy: deploying $SHA"
up
echo "deploy: $SHA is healthy"
```

- [ ] **Step 4: Make it executable and run the harness to verify it passes**

Run: `chmod +x scripts/deploy.sh scripts/deploy.test.sh && bash -n scripts/deploy.sh && bash scripts/deploy.test.sh`
Expected: `bash -n` silent (valid syntax); harness prints four `ok:` lines per case group and ends with `ALL PASS` (exit 0).

- [ ] **Step 5: Commit**

```bash
git add scripts/deploy.sh scripts/deploy.test.sh
git commit -m "deploy: host-side deploy script + rollback, with a bash test harness"
```

---

### Task 2: app healthcheck (makes `--wait` meaningful)

**Files:**
- Modify: `compose.yml` (the `app:` service)

**Interfaces:**
- Consumes: nothing. Produces: an `app` healthcheck so `docker compose up -d --wait` (Task 1's `up`) blocks until the app is serving `/api/health`.

- [ ] **Step 1: Add the healthcheck to the `app` service**

In `compose.yml`, inside the `app:` service (e.g. after the `depends_on:` block), add:

```yaml
    # `/api/health` reports DB connectivity; node 26 has a global fetch. Lets
    # `docker compose up -d --wait` mean "serving + DB-connected", not just
    # "container started" — the signal the deploy job's health gate relies on.
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 10s
      timeout: 3s
      retries: 5
      start_period: 20s
```

- [ ] **Step 2: Verify compose parses it**

Run: `POSTGRES_PASSWORD=x docker compose config | grep -A6 'healthcheck' | grep -q 'api/health' && echo OK`
Expected: `OK` (the app healthcheck appears in the resolved config; `POSTGRES_PASSWORD` is set only to satisfy the required-var interpolation).

- [ ] **Step 3: (Manual, if Docker is handy) confirm `--wait` goes healthy**

Run: `docker compose up -d --build --wait --wait-timeout 120 && docker inspect --format '{{.State.Health.Status}}' critter-app`
Expected: exits 0 and prints `healthy`. Then `docker compose down`. (Skip if no local Docker; the deploy will exercise it.)

- [ ] **Step 4: Commit**

```bash
git add compose.yml
git commit -m "compose: app healthcheck on /api/health so --wait gates on real health"
```

---

### Task 3: CI jobs — `deploy-script` (test) and `deploy` (SSH)

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `scripts/deploy.test.sh` (Task 1); the `app`/`sidecar`/`docker` jobs already in `ci.yml`; the `production` Environment + `DEPLOY_*` secrets (manual setup).
- Produces: a gated deploy that SSHes `"$SHA"` to the host (whose forced-command wrapper runs `deploy.sh`).

- [ ] **Step 1: Add the `deploy-script` job**

Append to `.github/workflows/ci.yml` (a normal GitHub-hosted job that keeps the shell honest):

```yaml
  deploy-script:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7.0.0
      - name: Lint + test the deploy script
        run: |
          bash -n scripts/deploy.sh
          bash scripts/deploy.test.sh
```

- [ ] **Step 2: Add the `deploy` job**

Append the deploy job. It needs no checkout — it only SSHes the SHA:

```yaml
  deploy:
    needs: [app, sidecar, docker, deploy-script]
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: self-hosted
    environment: production
    permissions:
      contents: read
    timeout-minutes: 20
    concurrency:
      group: deploy-prod
      cancel-in-progress: false
    steps:
      - name: Deploy over SSH
        env:
          SHA: ${{ github.sha }}
          DEPLOY_SSH_KEY: ${{ secrets.DEPLOY_SSH_KEY }}
          DEPLOY_KNOWN_HOSTS: ${{ secrets.DEPLOY_KNOWN_HOSTS }}
          DEPLOY_HOST: ${{ secrets.DEPLOY_HOST }}
          DEPLOY_USER: ${{ secrets.DEPLOY_USER }}
        run: |
          umask 077
          KEY="$(mktemp)"; KH="$(mktemp)"
          trap 'rm -f "$KEY" "$KH"' EXIT
          printf '%s\n' "$DEPLOY_SSH_KEY" > "$KEY"
          printf '%s\n' "$DEPLOY_KNOWN_HOSTS" > "$KH"
          ssh -i "$KEY" -o IdentitiesOnly=yes -o UserKnownHostsFile="$KH" \
            "$DEPLOY_USER@$DEPLOY_HOST" "$SHA"
```

Notes for the implementer:
- The remote command is **only** `"$SHA"`; the host forced-command wrapper ignores it beyond the SHA and runs `scripts/deploy.sh`. Do not add `set -x` (would echo around secrets; GitHub masks registered secrets but don't invite it).
- `concurrency` at job level serializes deploys; `cancel-in-progress: false` never interrupts one mid-flight.

- [ ] **Step 3: Validate the workflow YAML**

Run: `actionlint .github/workflows/ci.yml` (if installed: `brew install actionlint`) — or push the branch and confirm the Actions tab shows no workflow-parse error and the new jobs are listed.
Expected: no errors. On a PR, `deploy-script` runs; `deploy` is **skipped** (the `if` is false on PRs).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: gated self-hosted deploy job + deploy-script test job"
```

---

### Task 4: README deploy docs + setup checklist

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything above. Produces: operator documentation (no code).

- [ ] **Step 1: Add a "Deploying" section**

In `README.md`, after the Cloudflare tunnel section, add:

```markdown
## Deploying (on merge)

Merges to `main` are deployed to the LAN host by a GitHub Actions job on a
**self-hosted runner**, behind a manual approval. Flow: merge → CI passes → the
`deploy` job waits in the `production` environment for approval → on approve it
SSHes to the host and runs `scripts/deploy.sh <commit>`, which checks out that
exact commit and `docker compose up -d --build --wait` (respecting the host's
`COMPOSE_PROFILES`). An unhealthy build auto-rolls back to the previous commit and
the job goes red.

**One-time setup:**
1. **Branch-protect `main`** — require a PR, the CI checks (`app`, `sidecar`,
   `docker`, `deploy-script`) as required status checks, and block force-push.
2. **`production` environment** — Settings → Environments → `production`, add
   yourself as a required reviewer.
3. **Deploy key (forced-command)** — generate a dedicated ed25519 key; on the host
   add the public key to the deploy user's `~/.ssh/authorized_keys` prefixed with
   `restrict,command="$HOME/deploy-forced.sh"`, where `deploy-forced.sh` validates
   a 40-hex SHA from `$SSH_ORIGINAL_COMMAND` and execs `<checkout>/scripts/deploy.sh`.
4. **Environment secrets** — `DEPLOY_SSH_KEY` (private key), `DEPLOY_HOST`,
   `DEPLOY_USER` (in the `docker` group), `DEPLOY_KNOWN_HOSTS` (`ssh-keyscan` line),
   `DEPLOY_PATH` (the host checkout dir).
5. **Host** — `chmod 600` the `.env`; ensure the checkout is clean and deploy-only,
   and that `scripts/deploy.sh` is present (pull once after this lands).

The runner should be **deploy-only**, ideally ephemeral, with egress limited to the
host's SSH port. Do not make this repo public without Actions → "Require approval
for all outside collaborators".
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document the deploy-on-merge flow and one-time setup"
```

---

## Self-Review

**Spec coverage:**
- Trigger/gating (self-hosted, `needs` green, push+main, `production` approval, concurrency, `permissions`, `timeout`) → Task 3. ✓
- Connection & secrets (temp key/known_hosts, `umask 077`, cleanup, `env:`-passed SHA, SSH sends only the SHA) → Task 3. ✓
- Forced-command key handoff (SHA → wrapper → `deploy.sh`) → documented Task 4 + honored by Task 1's arg contract. ✓ (host wrapper itself is manual setup, per spec.)
- `deploy.sh` (SHA guard, dirty refusal, exact checkout, `--wait`, auto-rollback with `--wait-timeout`, COMPOSE_PROFILES from host) → Task 1. ✓
- Health gate (app healthcheck; postgres + depends_on already present) → Task 2. ✓
- Branch protection, Environment, key, secrets → manual (owner), documented Task 4. ✓
- ntfy-on-failure → **intentionally deferred** (spec "Notification" was optional; the auto-rollback + red job already surface failure via GitHub. Add later if wanted). Noted here so it's a conscious gap, not an omission.
- Base-image pinning → already satisfied (`node:26.4.0-slim`). ✓
- SHA-pinned actions → `deploy-script` pins `actions/checkout`; `deploy` uses none. ✓

**Placeholder scan:** none — all steps contain concrete code/commands.

**Type/name consistency:** `deploy.sh <sha>` contract (exit codes 0/1/2/3, env `DEPLOY_PATH`), the `up()` helper string `up -d --build --wait`, and the harness's assertions all match across Tasks 1 and 3; the `DEPLOY_*` secret names match between Task 3 and Task 4.

**One conscious deferral:** ntfy-on-failure notification (cheap follow-up; not required for a correct, safe deploy).
