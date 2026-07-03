# Project Skeleton — Natalie Saw a Critter! (nataliesawacritter.info)

**Date:** 2026-07-02
**Status:** Approved

## Purpose

Set up the project skeleton for a "critter tracker" web app: Natalie logs wildlife
sightings (emoji + optional name/date/time/place/comment/photo) and views them as a
calendar, a filterable history, and a leaderboard. The full UI design is specified in
`docs/design/` (high-fidelity handoff with prototype and screenshots).

This first task delivers tooling plus a thin vertical slice — every layer wired and
proven end to end (React page → Express API → Postgres), zero product features.
Feature work (sightings API, calendar UI, etc.) comes in later specs.

## Decisions (with alternatives considered)

| Decision | Choice | Alternatives rejected |
|---|---|---|
| Architecture | Single `app/` package: Vite React client + Express server, like pool_monitor's dashboard | Separate client/server packages (config duplication); full-stack framework (SSR adds nothing here) |
| DB durability | Docker named volume `pgdata` | Bind mount (permission quirks); backup sidecar (add later if wanted) |
| Hosting | Cloudflare tunnel service in compose from day one, behind a `tunnel` profile | Local-only (repo is literally named after the domain) |
| Write auth | Shared-secret basic auth middleware (env-configured); reads public | No auth (vandalism risk); user accounts (overkill for one user); defer (retrofit cost) |
| DB layer | Drizzle ORM + drizzle-kit SQL migrations | Raw pg (hand-maintained types); Prisma (heavy, codegen step) |
| DB testing | Real Postgres via `@testcontainers/postgresql` | CI service container (collides with dev data locally); mocks only (misses SQL bugs) |
| CI/CD | CI only (GitHub Actions + Dependabot); manual deploy via compose | GHCR publish, auto-deploy (not needed yet) |
| Photos | Files in named volume `photos` mounted at `/data/photos`; DB stores path. Volume declared now, upload built later | bytea in PG (bloat); S3/R2 (external dependency) |

## Versions (verified current 2026-07-02)

Node 24 LTS (24.18, image `node:24-slim`) · pnpm 11.9.0 · React 19.2.7 ·
Vite 8.1.3 · Vitest 4.1.9 · Express 5.2.1 · TypeScript 6.0.3 · ESLint 10.6 +
typescript-eslint 8.62 · drizzle-orm 0.45.2 / drizzle-kit 0.31.10 · pg 8.22 ·
@testcontainers/postgresql 12.0.4 · `postgres:18.4` · `cloudflare/cloudflared:2026.6.1`

Docker images pinned to exact versions (pool_monitor convention); npm deps use
caret ranges with the lockfile as the pin.

## Repo layout

```
nataliesawacritter.info/
├── docker-compose.yml
├── .env.example              # documented template; .env gitignored
├── .gitignore
├── README.md                 # setup + dev workflow + deploy notes
├── docs/
│   ├── design/               # extracted handoff (README, prototype html, screenshots)
│   └── superpowers/specs/    # this file and future specs
├── .github/
│   ├── workflows/ci.yml
│   └── dependabot.yml
└── app/
    ├── package.json          # type: module, packageManager pnpm@11.9.0, preinstall only-allow pnpm
    ├── Dockerfile
    ├── vite.config.ts
    ├── vitest.config.ts      # three projects: unit / client / integration
    ├── tsconfig.json / tsconfig.app.json / tsconfig.node.json / tsconfig.server.json
    ├── eslint.config.js
    ├── index.html
    ├── src/                  # React client
    ├── server/               # Express 5 API
    │   └── db/               # drizzle schema, pool, migrator bootstrap
    └── drizzle/              # generated SQL migration files (committed)
```

The handoff zip at the repo root is extracted into `docs/design/` and the zip deleted,
so the design reference is versioned and greppable.

## Docker compose

Three services; pinned images, healthchecks, hardened app container (pool_monitor
conventions: `no-new-privileges`, `cap_drop: ALL`, `read_only` + tmpfs, non-root user).

- **postgres** — `postgres:18.4`. Named volume `pgdata` → `/var/lib/postgresql`
  (data survives recreate/`down`; only `down -v` destroys it). Healthcheck
  `pg_isready`. Port 5432 published for local dev tools. Credentials from `.env`.
- **app** — `build: ./app`. `depends_on: postgres: condition: service_healthy`.
  Env: `DATABASE_URL`, `WRITE_USER`, `WRITE_PASSWORD`, `TZ`. Port 8080. Named volume
  `photos` → `/data/photos` (writable exception to the read-only FS, plus `/tmp` tmpfs).
- **cloudflared** — `cloudflare/cloudflared:2026.6.1`, `profiles: ["tunnel"]` so plain
  `docker compose up` never starts it. Prod host runs
  `docker compose --profile tunnel up -d` with `CLOUDFLARE_TUNNEL_TOKEN` set.

## App internals (the vertical slice)

- **Server** (`app/server/`): Express 5 on port 8080 (env-overridable).
  - Drizzle over a `pg` Pool from `DATABASE_URL`.
  - On startup, runs pending migrations from `app/drizzle/` via drizzle-orm's
    migrator, then listens. Deploys are just `compose up`.
  - `GET /api/health` → `SELECT 1` through the pool; `200 {ok: true, db: true}` or
    `503 {ok: false, db: false}` on failure.
  - Basic-auth middleware (compares against `WRITE_USER`/`WRITE_PASSWORD`, timing-safe)
    exported and unit-tested, but not yet mounted on any real route — wired when the
    first write endpoint lands.
  - In production, serves the built client from `dist/client` (SPA fallback).
  - Logs to stdout; docker captures.
- **Migration 0001**: creates `sightings` — `id uuid primary key default
  gen_random_uuid()` (reads are public, so non-enumerable IDs), `emoji text not null`, `name text`, `sighted_on date not null`,
  `sighted_time text` (free-form per design), `place text`, `comment text`,
  `photo_path text`, `created_at timestamptz not null default now()`. Matches the
  handoff data model; proves migration machinery with a table we keep.
- **Client** (`app/src/`): Vite + React 19. One minimal page: loads Fredoka/Quicksand,
  applies the page-gradient/ink design tokens from the handoff (tokens only — no
  product UI yet), fetches `/api/health`, renders "connected"/"unavailable" state.
  Vite dev server proxies `/api` → `localhost:8080` (tsx-watched Express).

## Testing harness

Vitest 4, three projects in `vitest.config.ts`:

| Project | Env | Scope | Slice test |
|---|---|---|---|
| unit | node | `server/**/*.test.ts` (excl. integration) | basic-auth middleware behavior |
| client | jsdom + Testing Library + jest-dom | `src/**/*.test.tsx` | health page renders both states |
| integration | node, longer timeout | `server/**/*.integration.test.ts` | Testcontainers PG 18: run real migrations, insert a sighting, read it back |

`pnpm test` runs all three; `pnpm test:coverage` adds v8 coverage. Integration tests
require Docker locally (true for GH ubuntu runners); they fail with a clear message if
Docker is absent rather than silently passing.

## CI/CD + hygiene

- **`.github/workflows/ci.yml`** — on PRs and pushes to main:
  - `app` job: pnpm/action-setup (11.9.0) → setup-node (24, pnpm cache) →
    `pnpm install --frozen-lockfile` → `pnpm lint` → `pnpm typecheck` →
    `pnpm test:coverage` → `pnpm build`.
  - `docker` job: buildx build of `./app`, no push.
- **`.github/dependabot.yml`** — weekly: `npm` in `/app`, `docker` in `/app`
  (Dockerfile base image), `docker-compose` in `/` (pinned service images),
  `github-actions` in `/`.
- **`.gitignore`** — node_modules, dist, coverage, .env, .DS_Store, editor dirs.
- **README** — prerequisites (Docker, Node 24, pnpm), `.env` setup from example,
  dev loop (`docker compose up postgres` → `pnpm dev:server` + `pnpm dev`),
  test/lint commands, prod deploy (compose with tunnel profile).

## Error handling

Minimal by design at skeleton stage: health endpoint degrades to 503 with
`{ok: false}`; server exits nonzero if migrations fail at startup (compose
`restart: unless-stopped` retries); client renders an explicit failure state.

## Definition of done

- `docker compose up` from a clean checkout (with `.env` from example) serves the
  health page on :8080 with a green DB status; data survives `compose down && up`.
- `pnpm lint`, `pnpm typecheck`, `pnpm test:coverage`, `pnpm build` all pass locally
  and in CI on the PR.
- No product features beyond the slice; sightings API/UI are future specs.

## Out of scope (future specs)

Sightings CRUD API · calendar/history/leaderboard UI · log-a-sighting flow ·
photo upload · backups · domain/DNS setup.
