# 🐾 Natalie Saw a Critter!

Natalie sees things, she sees them with her eyes. This app lets her log wildlife
sightings and view them as a calendar, a filterable history, and a Top Critters
leaderboard. Live (eventually) at nataliesawacritter.info.

The full UI design lives in [`docs/design/`](docs/design/README.md) — open
`docs/design/Natalies Critter Tracker.dc.html` in a browser for the interactive
prototype.

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

App: http://localhost:8080 — `GET /api/health` reports DB connectivity.

For public hosting via Cloudflare tunnel, set `CLOUDFLARE_TUNNEL_TOKEN` in
`.env` and run `docker compose --profile tunnel up -d`.

## API

    GET    /api/sightings?from=YYYY-MM-DD&to=YYYY-MM-DD   # public; filters optional/inclusive
    POST   /api/sightings                                 # basic auth (WRITE_USER/WRITE_PASSWORD)
    DELETE /api/sightings/:id                             # basic auth
    GET    /api/profiles                                  # public; saved critter friends
    POST   /api/profiles                                  # basic auth; emoji + name required
    DELETE /api/profiles/:id                              # basic auth

POST body: `emoji` and `sightedOn` (YYYY-MM-DD) required; `name`, `sightedTime`,
`place`, `comment` optional. With blank write credentials the write endpoints
return 503.

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
    pnpm test:coverage
    pnpm lint
    pnpm typecheck

CI runs all of the above plus a docker image build on every PR and push to main.
