# RSS Feed: Article in Title + Date in Description — Design Spec

**Date:** 2026-07-06
**Status:** Approved
**Depends on:** the RSS feed (PR #18, merged) — this refines `buildFeed.ts`.

## Purpose

Two small fixes to the RSS feed, since Natalie names critters by species:

1. The title reads "Natalie saw Cardinal" — add an indefinite article so it
   reads "Natalie saw **a** Cardinal" / "**an** Owl".
2. The item's time line has no date — add the sighting date so the time always
   sits next to its date.

Both live entirely in `app/server/feed/buildFeed.ts`.

## Decisions (alternatives considered)

| Decision | Choice | Alternatives rejected |
|---|---|---|
| a/an selection | Inline vowel-letter heuristic (no dependency) | The `indefinite` npm package (correct on "an hour"/"a ewe"/acronyms, but a new server dependency for a cosmetic title — the repo keeps deps minimal) |
| Proper names | Always prepend the article (accept the rare "a Mr Fox") | Detecting proper nouns to skip the article — research found no reliable lightweight signal; NLP (compromise) is heavy and still misclassifies species-vs-name |
| Date placement | In the item `<description>` body, on the date/time line, always shown | Only in `pubDate` (already there, but machine-facing and not what the user sees in the body) |
| Date derivation | Parse the `YYYY-MM-DD` string directly (no `Date`, no timezone) | `Date` + locale formatting (non-deterministic across TZ/locale; buildFeed is pure) |

## Changes to `buildFeed.ts`

**Article helper** (pure, internal):

```ts
function articleFor(name: string): string {
  return /^[aeiou]/i.test(name) ? 'an' : 'a'
}
```

`titleFor` for a named sighting becomes:
`${emoji} Natalie saw ${articleFor(name)} ${name}` (e.g. "🐦 Natalie saw a
Cardinal", "🦉 Natalie saw an Owl"). Unnamed is unchanged: `${emoji} Natalie
saw a critter`. The vowel heuristic is knowingly imperfect on oddballs
("a ewe", "an hour") — accepted for critter species.

**Date helper** (pure, internal, no `Date`/timezone):

```ts
const MONTHS = ['January','February','March','April','May','June','July',
  'August','September','October','November','December']

function formatDate(sightedOn: string): string {
  const [year, month, day] = sightedOn.split('-')
  return `${MONTHS[Number(month) - 1]} ${Number(day)}, ${year}`
}
```

`formatDate('2026-07-05')` → `"July 5, 2026"`.

**Description** gains an always-present date line (combining the time when
present), replacing the old time-only line. New order: place, date/time,
comment, photo:

```ts
function descriptionHtml(s: Sighting, siteUrl: string): string {
  const lines: string[] = []
  if (s.place !== null && s.place !== '') lines.push(`<p>📍 ${xmlEscape(s.place)}</p>`)
  const when =
    s.sightedTime !== null && s.sightedTime !== ''
      ? `${formatDate(s.sightedOn)} · ${xmlEscape(s.sightedTime)}`
      : formatDate(s.sightedOn)
  lines.push(`<p>📅 ${when}</p>`)
  if (s.comment !== null && s.comment !== '') lines.push(`<p>${xmlEscape(s.comment)}</p>`)
  if (s.photoPath !== null) lines.push(`<img src="${xmlEscape(siteUrl + s.photoPath)}" alt="" />`)
  return lines.join('\n')
}
```

Because the date line is always present, `descriptionHtml` never returns `''`,
so **every item now has a `<description>`** (before, a bare sighting had none).
`pubDate`, `guid`, `enclosure`, escaping, and the channel are unchanged.

## Testing (`buildFeed.test.ts`, updated)

- Article: named title includes the article — `a Cardinal` (consonant),
  `an Owl` (vowel), `a Fox`; unnamed still `a critter`.
- Date: the description always contains `📅 ` with the expected `"July 5, 2026"`
  format; with a `sightedTime`, the line combines date `·` time; the escaping
  and no-naked-ampersand guard still hold.
- The former "no item description when empty" test becomes "a bare sighting's
  description carries just the date line" (a `<![CDATA[` with the `📅` date and
  no place/comment/img).
- Existing escaping / enclosure / empty-feed / RFC-822 pubDate tests stay green.

## Out of scope

The `indefinite` library · proper-noun detection · changing `pubDate` · any app
UI change · date formatting locale options.

## Definition of done

- Feed titles read "Natalie saw a Cardinal" / "an Owl" for named sightings.
- Every item's description shows the sighting date (e.g. "📅 July 5, 2026"),
  with the time appended when present.
- Full suite, lint, typecheck, build green; CI green on the PR.
