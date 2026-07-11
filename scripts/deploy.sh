#!/usr/bin/env bash
# Host-side deploy. Given the CI-validated commit SHA, check it out and (re)build
# the compose stack, waiting for health; on an unhealthy build, roll back to the
# previously-deployed commit. Invoked (via the forced-command wrapper) as:
#   deploy.sh <40-hex-sha>     with DEPLOY_PATH pointing at the host checkout.
# COMPOSE_PROFILES comes from the host .env — do not pass profile flags here.
set -Eeuo pipefail

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
