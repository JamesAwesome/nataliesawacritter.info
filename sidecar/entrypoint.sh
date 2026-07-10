#!/usr/bin/env bash
set -euo pipefail

: "${GH_TOKEN:?GH_TOKEN required}"
: "${REPO_SLUG:?REPO_SLUG required (owner/name)}"
REPO_DIR="${REPO_DIR:-/repo}"

git config --global user.name "emoji-request sidecar"
git config --global user.email "sidecar@nataliesawacritter.info"
git config --global --add safe.directory "$REPO_DIR"

# Authenticate gh (and git-over-https) with the scoped token.
echo "$GH_TOKEN" | gh auth login --with-token
gh auth setup-git

# Fresh clone on first boot; the repo lives on a named volume across restarts.
if [ ! -d "$REPO_DIR/.git" ]; then
  echo "[sidecar] cloning $REPO_SLUG → $REPO_DIR"
  gh repo clone "$REPO_SLUG" "$REPO_DIR"
fi

exec pnpm --dir /app start
