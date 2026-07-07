# CLAUDE.md

Guidance for working in this repo. See `README.md` for product overview, setup,
running, and the deploy/tunnel details. This file covers conventions, subsystems,
and the workflow — the things that aren't obvious from the code.

## Layout & stack

One package under `app/`: React 19 + Vite client (`app/src/`) and an Express 5
API (`app/server/`), Drizzle ORM over Postgres, docker compose. Client and server
**cannot share modules** — the server tsconfig is DOM-free and uses `.js` import
extensions; the client is bundler-resolved. Where both need the same data (e.g.
custom-emoji stand-ins) the catalogue is deliberately split into two files kept in
sync by a drift-guard test.

## Commands (run from `app/`)

    pnpm test          # unit + client + integration (integration needs Docker)
    pnpm lint
    pnpm typecheck     # tsc for client AND server (server is a separate tsconfig)
    pnpm build

- Raw vitest needs the env prefix: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project <client|unit|integration> <path>`.
- Projects: `client` (jsdom), `unit` (node, server), `integration` (Testcontainers/Docker).
- **Coverage gate:** `pnpm test:coverage` enforces thresholds in `vitest.config.ts`
  (statements 93 / branches 90 / functions 92 / lines 94 — a ratchet floor a few
  points under current). CI runs it, so new code without tests can fail the build;
  raise the floor when coverage climbs, don't lower it to pass.
- **jsdom can't measure layout or load images.** Sizing, grid, and SVG-art bugs
  pass unit tests and still ship broken. For any visual/UI change, verify the real
  render — screenshot with headless Chrome (`/Applications/Google Chrome.app/...
  --headless --screenshot`) against the real CSS before calling it done. This has
  bitten us (a collapsed leaderboard grid) — don't trust green jsdom alone.

## Conventions

- **No raw hex in TSX** — use CSS design tokens (`var(--…)`, defined in
  `src/index.css` `:root`). Enforced by lint. SVG asset files (art) may use hex.
- **Server imports use `.js` extensions**; never import DOM types or client `src/`
  from server code or server tests.
- **Migrations** run automatically at server startup. Schema change → edit
  `server/db/schema.ts`, then `pnpm db:generate --name <change>`. **Data-only**
  migration (no schema diff) → `pnpm drizzle-kit generate --custom --name <change>`
  then write the SQL. Commit everything in `app/drizzle/` incl. `meta/`.
- Don't store display strings in the DB — store sortable/raw values, format at the
  edge (see sighting time below).

## Subsystems worth knowing

- **Custom emoji** (`src/lib/customEmoji.ts` + `server/customEmoji.ts`): a
  `custom:<slug>` token stored in the `sightings.emoji` text column — no DB table.
  Each entry is `{ slug, name, standIn, category }`; the SVG lives in
  `public/custom-emoji/<slug>.svg`. `CritterGlyph` renders the token as its image
  (Unicode emoji pass through as text); text-only surfaces (RSS, push) use the
  `standIn`. **Adding one** = SVG + client `CUSTOM` entry + server `STAND_INS` entry
  + both pinned-slug-list tests. Drift-guard tests assert client/server/on-disk all
  agree, so a half-add fails CI. Custom emoji are **not** bird-only — `category`
  places them into the picker's groups.
- **Emoji picker categories** (`src/lib/emojiCategories.ts`): the "Other" grid is
  five data-driven groups (Birds, Mammals, Reptiles & Amphibians, Sea Life, Bugs).
  Each group is `[…custom tokens for that category, …that category's Unicode]`. A
  coverage test asserts the groups cover `CURATED ∪ EXTENDED` exactly once.
- **Sighting time**: stored as sortable 24h `HH:MM` (`sightedTime`), formatted for
  display at the edge (`formatClockTime` client, `formatClock` in `buildFeed`).
  Recent Critters / the list are ordered client-side in `useSightings` by
  `sightedOn` → time-of-day → `createdAt`; untimed rows sink below timed ones.
- **Leaderboard** (`src/lib/insights.ts`): client-side aggregation grouped by
  `(emoji, normalizedName)` — no `GROUP BY`, so no index needed.
- **RSS** (`/feed.xml`, `server/feed/buildFeed.ts`), **push/VAPID**
  (`server/push/`), **PWA** (manifest + service worker). Entry is gated by basic
  auth credentials held client-side.

## Security

Reads are public by design; writes need Basic auth (`writeGate`). Controls live in
`server/app.ts` (helmet CSP + security headers; `express-rate-limit` keyed on
`CF-Connecting-IP` — a failed-request `authLimiter` throttles brute-force across
all write routes, a GET-skipping `mutationLimiter` bounds public mutations),
`server/sightings/stripJpeg.ts` (photo EXIF/GPS strip via `exif-be-gone` + an SOI
fail-closed check), and `server/push/routes.ts` (SSRF host allowlist). The public
sightings GET coarsens `createdAt` to the minute; the origin is tunnel-only
(compose binds `127.0.0.1`), which is what makes the `CF-Connecting-IP` key safe.

Principles when touching security: **fail closed** (reject on doubt, don't pass
through); **don't hand-roll a parser** for a security control — use a maintained
library (a hand-rolled EXIF stripper here shipped two GPS-leak bypasses before
being replaced); and **adversarially review** security-critical changes (a
red-team pass with real PoCs, not just a friendly read).

## Workflow

This project is built with a disciplined flow — follow it unless the change is
tiny:

1. **Brainstorm** a design → spec in `docs/superpowers/specs/YYYY-MM-DD-*.md`.
2. **Plan** → `docs/superpowers/plans/YYYY-MM-DD-*.md`.
3. **Execute** via subagent-driven development (implementer + reviewer per task)
   for substantial features; implement directly for small, well-specified changes.
4. Work in a **git worktree**; ship as a **squash-merged PR**; wait for CI (app +
   docker) green, confirm the run matches the PR head, then merge and clean up.

TDD throughout (write the failing test first). Prefer root-cause fixes over
symptom patches. For anything visual, gate on a real-browser render. Commit and PR
trailers follow the repo's existing convention.
