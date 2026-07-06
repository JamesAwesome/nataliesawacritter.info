# RSS Feed — Design Spec

**Date:** 2026-07-06
**Status:** Approved
**Depends on:** current main (through footer/swipe #17).

## Purpose

Let people follow Natalie's critter sightings in any feed reader. A public
`GET /feed.xml` serves an RSS 2.0 feed of recent sightings — emoji, name, place,
comment, and photo — that readers poll for updates.

## Decisions (alternatives considered)

| Decision | Choice | Alternatives rejected |
|---|---|---|
| Liveness | Plain RSS (readers poll) | WebSub push (external hub dependency + more code; readers poll anyway) |
| Format | RSS 2.0 | Atom / JSON Feed (RSS 2.0 has the widest reader support for "an RSS feed") |
| New-item ordering | `sightedOn` desc, then `createdAt` desc (the store's existing order) | Order by `createdAt` (would surface backdated entries as newest). **Consequence accepted:** a backdated sighting appears at its historical date, not the top. |
| Photos | Inline `<img>` in the description + `<enclosure>` | Text-only (loses the visual payload) |
| Item link | Site root | Per-sighting deep link (the SPA has no per-sighting route) |
| Absolute URLs | New `SITE_URL` env (default `https://nataliesawacritter.info`) | Hardcoding the domain (breaks local/dev feeds) |

## Endpoint

`GET /feed.xml` — public, mounted in `app.ts` **before** the SPA static/fallback
(it is not under `/api`, so it must be registered ahead of the client catch-all).

- `Content-Type: application/rss+xml; charset=utf-8`
- `Cache-Control: public, max-age=300` (5 min — cheap polling)
- Body: the RSS XML for the 50 most recent sightings from
  `sightingsStore.list()` (already ordered `sightedOn` desc, `createdAt` desc),
  sliced to 50.

Autodiscovery: add to `app/index.html` `<head>`:

```html
<link rel="alternate" type="application/rss+xml" title="Natalie Saw a Critter!" href="/feed.xml" />
```

## Feed structure

Channel:
- `<title>🐾 Natalie Saw a Critter!</title>`
- `<link>{siteUrl}</link>`
- `<description>Live-ish updates on the critters Natalie sees.</description>`
- `<language>en-us</language>`
- `<atom:link href="{siteUrl}/feed.xml" rel="self" type="application/rss+xml" />`
  (declare the `xmlns:atom="http://www.w3.org/2005/Atom"` namespace on `<rss>`)
- `<lastBuildDate>` = the newest item's `pubDate`, or omitted when the feed is
  empty (kept deterministic — derived from data, not a clock, so `buildFeed`
  needs no injected time).

Each `<item>`:
- `<title>` — `` `${emoji} Natalie saw ${name}` `` when named, else
  `` `${emoji} Natalie saw a critter` ``. XML-escaped.
- `<description>` — `<![CDATA[ … ]]>` containing simple HTML: a line for
  place/comment/time when present (each omitted when null/empty), plus
  `<img src="{siteUrl}{photoPath}" alt="" />` when `photoPath` is set. Any
  literal `]]>` in user text is split to avoid closing the CDATA early.
- `<enclosure url="{siteUrl}{photoPath}" type="image/jpeg" length="0" />` only
  when `photoPath` is set. `length="0"` is a deliberate best-effort — the
  builder stays pure and does not stat files; readers tolerate it.
- `<guid isPermaLink="false">{id}</guid>` — the sighting UUID, so readers dedupe.
- `<pubDate>` — RFC-822 from `sightedOn` at noon UTC:
  `new Date(`${sightedOn}T12:00:00Z`).toUTCString()` (noon avoids any
  timezone date-shift; `toUTCString()` yields the `Mon, 06 Jul 2026 12:00:00
  GMT` form RSS expects).
- `<link>{siteUrl}</link>` — the site root (no per-sighting route).

`photoPath` is stored as the API-relative `/api/photos/<file>`, so absolute URLs
are just `{siteUrl}{photoPath}` (siteUrl has no trailing slash).

## Architecture

New `app/server/feed/` module, mirroring the existing feature-module layout:

- **`buildFeed.ts`** — pure: `buildFeed(sightings: Sighting[], siteUrl: string): string`
  returns the complete RSS XML string. Holds the XML-escape helper
  (`&`,`<`,`>`,`"`,`'` in text/attributes), the CDATA guard, the RFC-822
  formatter, and the item mapping. No I/O, no clock — fully unit-testable.
- **`routes.ts`** — `feedRouter(store: SightingsStore, siteUrl: string): Router`
  with `GET /feed.xml`: `store.list()` → `.slice(0, 50)` → `buildFeed(...)` →
  set headers → send. (Uses the existing `SightingsStore`; no new store.)

Wiring: `createApp` deps gain `siteUrl: string`; `app.ts` mounts
`app.use(feedRouter(deps.sightingsStore, deps.siteUrl))` before the SPA
fallback. `index.ts` reads `SITE_URL` (default `https://nataliesawacritter.info`)
into the deps. Existing `createApp` call sites in tests add `siteUrl:
'https://example.test'` (or similar).

## Config

- `.env.example` and `docker-compose.yml`: new `SITE_URL` var, documented as the
  public origin used for absolute URLs in the feed (no trailing slash), default
  `https://nataliesawacritter.info`.

## Testing

- **`buildFeed.test.ts`** (pure, no I/O): output is well-formed XML (parse it and
  assert no error); required channel elements present; item count matches input;
  named vs unnamed titles; `&`/`<`/`>` in a name/comment are escaped (feed still
  parses); a photo yields an absolute `<enclosure>` URL and an inline `<img>`
  with the absolute src; an item without a photo has neither; `pubDate` is the
  expected RFC-822 string for a known `sightedOn`; guid equals the id; empty
  input yields a valid channel with zero items and no `lastBuildDate`.
- **`routes.test.ts`** (fake store): 200 with `application/rss+xml; charset=utf-8`
  and the 5-min cache header; the store list is sliced to 50; the response body
  contains an item for a stored sighting.
- Full suite, lint, typecheck, build green; CI green.

## Out of scope

WebSub/push · per-sighting permalink routes · a visible "RSS" link in the app UI
(only the `<head>` autodiscovery link) · Atom/JSON Feed variants · feed
pagination · statting photos for real `enclosure` lengths.

## Definition of done

- `GET /feed.xml` returns a valid RSS 2.0 feed of the 50 most recent sightings,
  each with emoji+name title, place/comment/time, and (when present) an inline
  photo and enclosure using absolute `SITE_URL` URLs; validated by a feed reader
  or an online RSS validator against the deployed site.
- The `<head>` autodiscovery link makes browsers/readers offer the feed.
- With `SITE_URL` unset, absolute URLs use the production default.
- Full suite, lint, typecheck, build green; CI green on the PR.
