# 🐾 [Natalie Saw a Critter!](https://nataliesawacritter.info)

[![CI](https://github.com/JamesAwesome/nataliesawacritter.info/actions/workflows/ci.yml/badge.svg)](https://github.com/JamesAwesome/nataliesawacritter.info/actions/workflows/ci.yml)
[![RSS feed](https://img.shields.io/badge/RSS-feed-EE802F?logo=rss&logoColor=white)](https://nataliesawacritter.info/feed.xml)

Natalie sees things, she sees them with her eyes. This app lets her log
wildlife sightings — with photos, how many she saw (1·2·3·many), saved "critter
friends," and hand-drawn custom emoji for local critters that Unicode forgot
(robins, a groundhog, an Atlantic puffin…) — and view them as a calendar, a
filterable history, and a Top Critters leaderboard grouped by the names she
gives them. The emoji picker sorts everything into categories (Birds, Mammals,
Sea Life…), and she can **request a new critter emoji** right from the picker —
optionally, a coding agent turns each request into a pull request (see below).
Friends can keep up with new sightings as they happen via push notifications (it
installs as a PWA on phones) or an RSS feed. Live at nataliesawacritter.info.

## Stack

React 19 + Vite client and Express 5 API in one package (`app/`), Drizzle ORM
over Postgres 18, all orchestrated with docker compose. Postgres data lives in
the `pgdata` named volume; only `docker compose down -v` destroys it.

## Prerequisites

- Docker (with compose)
- Node 26 + pnpm 11 (`npm install -g pnpm`) — only needed for development

## Running it

    cp .env.example .env    # then set POSTGRES_PASSWORD (see comments inside)
    docker compose up -d --build

App: http://localhost:8080 — `GET /api/health` reports DB connectivity. If 8080 is
already taken, set `APP_PORT` in `.env` (the container still listens on 8080 internally).

The port is bound to `127.0.0.1` by default, so the app is reachable on this machine
but **not** the LAN. To expose it to other machines on your network, set
`APP_BIND=0.0.0.0` in `.env`. (Publishing to the host is not needed for the Cloudflare
tunnel — see below.)

### Cloudflare tunnel

For public hosting, set `CLOUDFLARE_TUNNEL_TOKEN` in `.env` and run:

    docker compose --profile tunnel up -d

Then, in the Cloudflare Zero Trust dashboard (**Networks → Tunnels → your tunnel →
Public Hostname**), point the origin **Service** at:

    http://app:8080

`app` is the compose service name (cloudflared resolves it over the docker network) and
`8080` is the container's **internal** port — **not** `APP_PORT`. `APP_PORT`/`APP_BIND`
only affect host publishing, which the tunnel bypasses entirely: cloudflared talks to the
app container directly, so the tunnel works even when the host port is bound to localhost
or not published at all. Using `localhost`, `127.0.0.1`, the LAN IP, or `APP_PORT` here is
the usual cause of `dial tcp ...: connection refused` in the cloudflared logs.

## Push notifications

Friends can tap the 🔔 in the header to get a push notification whenever Natalie
logs a sighting dated today (backdated entries stay silent). To enable: run
`npx web-push generate-vapid-keys` once and set `VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` in `.env` (rotating the keys
invalidates all subscriptions). With them unset the bell hides and the push
endpoints return 503.

On iPhone, web push requires the app to be installed first: Share →
Add to Home Screen, then tap the bell inside the installed app. The bell walks
friends through this.

### How many are subscribed

There's no UI or endpoint for this by design — query the DB directly. Each
subscribed browser is one row in `push_subscriptions` (upserted on its unique
endpoint):

    docker compose exec postgres psql -U critters -d critters \
      -c "SELECT count(*) FROM push_subscriptions;"

Two caveats: it counts **devices/browsers, not people** (no user identity is
stored, so one person on a phone and a laptop counts twice), and it slightly
over-reports because dead subscriptions are pruned only when a notification is
actually sent (the notifier drops an endpoint on a 404/410 from the push
service).

## Requesting new critters

When a critter isn't in the picker yet, Natalie can request it (a name + optional
note). Requests are **owner-only** — the form and the request list sit behind the
same write credentials as logging a sighting — and each shows its status: pending,
a link to its pull request, or why it was skipped.

### Emoji-request sidecar (optional agent)

An optional background service turns those requests into pull requests. It polls
for pending requests, and for each one runs a coding agent (Claude Code, headless)
that draws an **original** critter emoji following the repo's
`adding-a-critter-emoji` skill, gates on a real-browser render, and **opens a PR —
never merging**. Copyright is enforced by the skill (original or verifiably-CC0
art only; it refuses "make it look like <copyrighted character>").

Two "watch my own PRs" behaviours close the loop:

- **Iterate via PR comments** — comment `/iterate <feedback>` (e.g. `/iterate make
  the beak bigger`) on a sidecar PR and the agent updates the emoji on that branch.
  Only GitHub logins in `SIDECAR_ALLOWED_COMMENTERS` can trigger it (empty = off,
  deny by default); the feedback is treated as untrusted data, not instructions.
- **Auto-remove on merge** — once a request's PR is merged (accepted), the request
  is deleted so it drops off the list.

It's off unless you start its compose profile, needs its own API key + a scoped
GitHub PAT (Contents + PRs, **no merge**), and runs entirely outside the app image.
See [`sidecar/README.md`](sidecar/README.md) for setup.

## Security & privacy

Reads are public by design (sightings, profiles, photos, the RSS feed); writes
require HTTP Basic auth (`WRITE_USER` / `WRITE_PASSWORD` — use a high-entropy
password). Hardening in place:

- **Security headers** — `helmet` with a tuned Content-Security-Policy,
  `frame-ancestors 'none'`, HSTS, `Referrer-Policy`, `Permissions-Policy`; no
  `X-Powered-By`.
- **Rate limiting** — failed write-auth attempts and public mutations (incl. push
  subscribe) are throttled per client IP (keyed on `CF-Connecting-IP`, so it works
  behind the Cloudflare tunnel). Public GET reads/feed are never limited.
- **Photo metadata stripping** — uploaded photos are re-encoded server-side with
  `sharp`, which strips all metadata (EXIF/GPS/XMP/IPTC/COM/ICC) and validates the
  bytes are a real image (rejecting malformed/non-image uploads), on top of the
  client's canvas re-encode. Filenames are random tokens.
- **Push SSRF allowlist** — subscription endpoints are restricted to real
  push-service hosts (FCM/Mozilla/Apple/WNS).
- **Privacy** — sightings are public, so the log form warns against entering a
  home address or exact location, and the public API coarsens the insert
  timestamp to the minute. The origin is reachable only via the tunnel (compose
  binds `127.0.0.1`).

Not yet done (tracked, low severity): gating reads, delivery-time push
re-validation, shorter photo cache TTL.

## API

    GET    /api/sightings?from=YYYY-MM-DD&to=YYYY-MM-DD   # public; filters optional/inclusive
    POST   /api/sightings                                 # basic auth (WRITE_USER/WRITE_PASSWORD)
    DELETE /api/sightings/:id                             # basic auth
    PUT    /api/sightings/:id/photo                       # basic auth; raw image/jpeg body (≤6MB)
    DELETE /api/sightings/:id/photo                       # basic auth
    GET    /api/photos/:filename                          # public; immutable cache
    GET    /api/profiles                                  # public; saved critter friends
    POST   /api/profiles                                  # basic auth; emoji + name required
    DELETE /api/profiles/:id                              # basic auth
    GET    /api/emoji-requests?pending=1                  # basic auth; owner-only; ?pending filters to open
    POST   /api/emoji-requests                            # basic auth; {name, note?}
    PATCH  /api/emoji-requests/:id                        # basic auth; mark handled {outcome, pr_url?}
    DELETE /api/emoji-requests/:id                        # basic auth
    GET    /api/auth/check                                # basic auth; 204/401, 503 when writes disabled
    GET    /api/push/vapid-public-key                     # public; 503 when push disabled
    POST   /api/push/subscriptions                        # public; browser push subscription JSON
    DELETE /api/push/subscriptions                        # public; body {endpoint}
    GET    /feed.xml                                      # public; RSS 2.0 feed of recent sightings

Sighting POST body: `emoji` and `sightedOn` (YYYY-MM-DD) required; `name`,
`sightedTime`, `place`, `comment`, `quantity` (`1`·`2`·`3`·`many`, default `1`)
optional. With blank write credentials the write endpoints return 503.

## Development

    docker compose up -d postgres
    cd app
    pnpm install
    DATABASE_URL=postgres://critters:<your-password>@localhost:5432/critters pnpm dev:server
    pnpm dev   # second terminal; vite proxies /api → :8080

Migrations run automatically at server startup. To create one: edit
`app/server/db/schema.ts`, then `pnpm db:generate --name <change>` and commit
the generated files in `app/drizzle/`.

Note: `app/pnpm-workspace.yaml` is auto-generated/maintained by pnpm 11's supply-chain gates (build-script allowlist, minimum-release-age exclusions). It must stay committed and is copied into the Docker build; if you bump `tsx` or `vite`, pnpm may update it — commit that change too.

## Tests & checks

    pnpm test            # unit + client + integration (integration needs Docker)
    pnpm test:coverage   # same run, with coverage thresholds enforced
    pnpm lint
    pnpm typecheck

CI runs all of the above plus a docker image build on every PR and push to main.

**Coverage gate:** `pnpm test:coverage` fails if coverage falls below the
thresholds in `app/vitest.config.ts` (statements 93 / branches 90 / functions 92 /
lines 94 — a floor a few points below current). CI runs it, so the gate applies to
every PR: new code generally needs tests to land.

## Author & license

Made by [James Awesome](https://github.com/JamesAwesome). Licensed under
GPL-3.0 — see [LICENSE](LICENSE).
