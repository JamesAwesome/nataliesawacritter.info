#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/repo}"

# As root: make the /repo volume writable by the non-root user, then re-exec as
# it. The Claude CLI refuses --dangerously-skip-permissions when running as root.
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$REPO_DIR"
  chown -R node:node "$REPO_DIR"
  exec gosu node "$0" "$@"
fi

# Deny by default — but fail *slowly*: restart:unless-stopped would otherwise
# tight-loop on a misconfigured start. Sleep so the log stays readable.
missing=""
for v in ANTHROPIC_API_KEY GH_TOKEN REPO_SLUG WRITE_USER WRITE_PASSWORD; do
  [ -z "${!v:-}" ] && missing="$missing $v"
done
if [ -n "$missing" ]; then
  echo "[sidecar] not configured — set:${missing} (see .env.example). Sleeping 60s."
  sleep 60
  exit 1
fi

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
