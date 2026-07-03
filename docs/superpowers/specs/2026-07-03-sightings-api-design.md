# Sightings CRUD API — Design Spec

**Date:** 2026-07-03
**Status:** Approved
**Depends on:** project skeleton (docs/superpowers/specs/2026-07-02-project-skeleton-design.md)
**Consumed by (next cycle):** Calendar UI spec

## Purpose

First product feature: the REST API the entire UI will consume. Three endpoints —
list, create, delete. No edit endpoint: the design handoff (docs/design/README.md)
has no edit flow; sightings are created, viewed, and deleted only (YAGNI).

Development order decision: API before Calendar UI. The API is fully buildable and
testable without UI; the calendar has nothing to render without it.

## Decisions (alternatives considered)

| Decision | Choice | Alternatives rejected |
|---|---|---|
| API shape | Minimal REST: GET list (from/to filters) + POST + DELETE; client derives calendar/leaderboard/recent views | Per-view server endpoints (aggregation scale Natalie won't hit); PATCH edit endpoint (no edit flow in design) |
| Validation | emoji + sightedOn required; length caps; unknown fields rejected; hand-rolled (no schema library for 6 fields) | Only-emoji-required (server-side today-defaulting is timezone-dependent duplication); emoji allowlist (design's "Other" keyboard allows arbitrary emoji) |
| Missing write credentials | Writes return 503 "writes disabled" + startup warning; deny by default | Server refuses to start (kills public reads too); silently open writes (vandalism) |
| Code structure | store module (Drizzle only) + routes module (HTTP/validation) wired via createApp DI | Inline queries in handlers (validation untestable without DB); service/repository interfaces (ceremony) |

## Endpoints

All request/response bodies are JSON. Field names are camelCase (matching the
Drizzle schema's TS property names).

### GET /api/sightings — public

Query params (both optional): `from`, `to` — `YYYY-MM-DD`, inclusive bounds on
`sighted_on`; either may be omitted for an open-ended range (matches the History
tab's filter semantics in the design).

- 200: JSON array ordered by `sighted_on` DESC, then `created_at` DESC. Each item:
  `{ id, emoji, name, sightedOn, sightedTime, place, comment, photoPath, createdAt }`
  — nullable fields present as `null`, `createdAt` as ISO 8601 string.
- 400 `{ "error": "validation", "details": { "from": "must be YYYY-MM-DD" } }` for
  malformed date params (also when `from` > `to`).

### POST /api/sightings — basic auth (write)

Body fields:

| Field | Required | Constraint |
|---|---|---|
| `emoji` | yes | non-empty string, ≤ 16 chars |
| `sightedOn` | yes | `YYYY-MM-DD`, must be a real calendar date |
| `name` | no | string ≤ 100 chars |
| `sightedTime` | no | string ≤ 100 chars (free-form per design; "just now" display when absent is a client concern) |
| `place` | no | string ≤ 100 chars |
| `comment` | no | string ≤ 1000 chars |

Length caps are measured in UTF-16 code units (`String.prototype.length`) — the
16-unit emoji cap comfortably fits multi-codepoint emoji like 👨‍👩‍👧‍👦 (11 units).

Unknown fields — including `photoPath` (upload is a future feature) and `id` —
are rejected with 400, not silently dropped. Optional fields may be omitted or
`null`; empty strings are normalized to `null`.

- 201: the created row, same shape as GET items.
- 400 `{ "error": "validation", "details": { <field>: <message>, ... } }` — all
  failing fields reported at once.
- 401 / 503: see Auth.

### DELETE /api/sightings/:id — basic auth (write)

- 204 on successful delete.
- 400 `{ "error": "validation", "details": { "id": "must be a uuid" } }` if `:id`
  is not a valid uuid.
- 404 `{ "error": "not found" }` if no row has that id.
- 401 / 503: see Auth.

## Auth

- Write endpoints (POST, DELETE) sit behind `requireWriteAuth` (existing
  timing-safe middleware). Reads stay public.
- Credentials come from `WRITE_USER` / `WRITE_PASSWORD` env vars (already plumbed
  through compose and .env.example).
- **Empty-credential guard** (discharges a deferred skeleton-review finding):
  `requireWriteAuth` throws at construction if user or password is empty. When
  either env var is unset/empty, `createApp` mounts write routes behind a handler
  returning 503 `{ "error": "writes disabled" }` instead, and the entrypoint logs
  a startup warning naming the missing vars. Deny-by-default.
- Add the deferred missing-colon test (`Basic` header whose decoded payload lacks
  `:`) to auth.test.ts while in that file.

## Code structure

```
app/server/
├── sightings/
│   ├── store.ts          createSightingsStore(db) → { list, create, remove }
│   ├── store.integration.test.ts
│   ├── routes.ts         sightingsRouter(store, writeGate) → express.Router
│   │                     (validation lives here; writeGate is the auth
│   │                      middleware OR the 503 writes-disabled handler)
│   └── routes.test.ts    unit tests with a fake store
├── app.ts                createApp deps grow to:
│                         { checkDb, sightingsStore, writeCredentials }
│                         writeCredentials: { user, password } | null
└── index.ts              reads WRITE_USER/WRITE_PASSWORD → writeCredentials
                          (null unless both non-empty), warns when null
```

Store interface (exact signatures the routes consume):

```ts
type NewSighting = {
  emoji: string
  sightedOn: string
  name: string | null
  sightedTime: string | null
  place: string | null
  comment: string | null
}
type Sighting = NewSighting & { id: string; photoPath: string | null; createdAt: Date }

createSightingsStore(db): {
  list(range: { from?: string; to?: string }): Promise<Sighting[]>
  create(fields: NewSighting): Promise<Sighting>
  remove(id: string): Promise<boolean>   // false = no such row → 404
}
```

## Error handling

- Validation errors: 400, all failing fields in one response.
- Store/db errors propagate to an Express error handler → 500
  `{ "error": "internal" }`, details logged server-side only (no leak).
- JSON body parse failures → Express's 400 (acceptable default).

## Testing

Unit (fake store, real HTTP via withServer):
- Validation matrix: each field's failure modes (missing/wrong type/too long/bad
  date/unknown field), multi-field error aggregation, empty-string→null
  normalization.
- Auth: 401 without/with-wrong creds on POST and DELETE; GET stays public; 503 on
  writes when credentials absent.
- DELETE: 400 non-uuid, 404 store-miss, 204 store-hit.
- requireWriteAuth: throws on empty user or password; missing-colon header → 401.

Integration (Testcontainers, real PG 18):
- Store round-trip: create several, list ordering (sighted_on DESC, created_at
  DESC), from/to inclusive filtering incl. open-ended bounds, remove true/false.
- One full-stack seam test: real router + real store + real DB through HTTP —
  POST → GET → DELETE → GET.

## Out of scope (future cycles)

Calendar/History/Top Critters UI · log-a-sighting client flow · photo upload
(photoPath stays null) · pagination · client-side auth UX (how Natalie's browser
stores the password is the UI cycle's concern).

## Definition of done

- All three endpoints behave per contract against the compose stack (manual curl
  smoke: create with auth, list, delete).
- New unit + integration tests pass; existing suite stays green; CI green.
- Empty-credential guard in place with tests; missing-colon auth test added.
- No UI changes.
