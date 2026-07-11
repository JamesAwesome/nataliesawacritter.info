# Optional emoji-request sidecar. Heavy image (node + git + gh + chromium +
# claude CLI) — built only when you opt in: `docker compose --profile sidecar up`.
FROM node:26-bookworm

# git, curl, the GitHub CLI, and chromium (for the skill's render gate) + emoji
# fonts so rendered SVGs look right.
RUN apt-get update && apt-get install -y --no-install-recommends \
      git curl ca-certificates gosu chromium imagemagick fonts-noto-color-emoji fonts-liberation \
    && mkdir -p -m 755 /etc/apt/keyrings \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
         | tee /etc/apt/keyrings/githubcli-archive-keyring.gpg >/dev/null \
    && chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
         > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update && apt-get install -y --no-install-recommends gh \
    && rm -rf /var/lib/apt/lists/* \
    # Debian ships ImageMagick 6 (command `convert`, no unified `magick`). The
    # matte tool calls `magick`; add a shim so the same command works on the
    # container (IM6) and on dev machines (IM7). The pipeline uses only IM6/IM7-
    # portable ops (-fuzz/-transparent/-trim/-resize/-extent).
    && ln -sf "$(command -v convert)" /usr/local/bin/magick

# pnpm (pinned to CI's version) + the Claude Code CLI
RUN npm i -g pnpm@11.9.0 @anthropic-ai/claude-code

# The Claude CLI refuses --dangerously-skip-permissions as root, so the
# entrypoint drops to the base image's built-in non-root `node` user (uid 1000).

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY . .

# Emoji-art tools on PATH so the agent (running in the app-repo worktree) can
# call them. They run the sidecar's own TS via tsx (installed as a devDep above).
RUN printf '#!/bin/sh\nexec /app/node_modules/.bin/tsx /app/src/tools/gen-emoji-art.ts "$@"\n' > /usr/local/bin/gen-emoji-art \
 && printf '#!/bin/sh\nexec /app/node_modules/.bin/tsx /app/src/tools/matte-emoji.ts "$@"\n' > /usr/local/bin/matte-emoji \
 && chmod +x /usr/local/bin/gen-emoji-art /usr/local/bin/matte-emoji

RUN chown -R node:node /app

ENV REPO_DIR=/repo
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
