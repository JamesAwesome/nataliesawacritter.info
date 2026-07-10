#!/usr/bin/env bash
set -euo pipefail

: "${GH_TOKEN:?GH_TOKEN required}"
: "${REPO_SLUG:?REPO_SLUG required (owner/name)}"
REPO_DIR="${REPO_DIR:-/repo}"

git config --global user.name "emoji-request sidecar"
git config --global user.email "sidecar@nataliesawacritter.info"
git config --global --add safe.directory "$REPO_DIR"

# gh authenticates from GH_TOKEN in the environment automatically — do NOT run
# `gh auth login` here (it errors/aborts when GH_TOKEN is already set). Make
# plain git-over-https use the same token so the agent can push branches.
git config --global credential.helper store
printf 'https://x-access-token:%s@github.com\n' "$GH_TOKEN" > "$HOME/.git-credentials"
chmod 600 "$HOME/.git-credentials"

# Fresh clone on first boot; the repo lives on a named volume across restarts.
if [ ! -d "$REPO_DIR/.git" ]; then
  echo "[sidecar] cloning $REPO_SLUG → $REPO_DIR"
  gh repo clone "$REPO_SLUG" "$REPO_DIR"
fi

exec pnpm --dir /app start
