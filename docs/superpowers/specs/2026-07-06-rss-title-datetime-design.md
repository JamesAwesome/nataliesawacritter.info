# RSS Feed: Date/Time in the Item Title — Design Spec

**Date:** 2026-07-06
**Status:** Approved
**Depends on:** the RSS feed + title-article/date work (PRs #18, #19, merged).

## Purpose

Feed readers show the item **title** in their list view. Put the sighting's
date (and time when present) into the title so subscribers see it at a glance,
instead of only in the description body.

## Decisions (alternatives considered)

| Decision | Choice | Alternatives rejected |
|---|---|---|
| Format | Suffix, full date + time: `<base> — July 5, 2026 · dawn` | Prefix short date (`Jul 5 · …` — scannable but pushes the fun part right); suffix short (`· Jul 5` — less readable) |
| Scope of suffix | All items, named and unnamed | Named-only (the date is useful for every item) |
| Description date line | Keep it (date shows in both title and body) | Remove from description (some readers truncate long titles) |
| Time source | `sightedTime` appended raw with ` · `, escaped once by the existing outer `xmlEscape(titleFor(...))` | Escaping inside `titleFor` (would double-escape) |

## Change to `buildFeed.ts`

Only `titleFor` changes. Add a small `whenSuffix` (reusing the existing
`formatDate`) and append it to the base title:

```ts
function whenSuffix(s: Sighting): string {
  const date = formatDate(s.sightedOn)
  return s.sightedTime !== null && s.sightedTime !== ''
    ? `${date} · ${s.sightedTime}`
    : date
}

function titleFor(s: Sighting): string {
  const base =
    s.name === null
      ? `${s.emoji} Natalie saw a critter`
      : `${s.emoji} Natalie saw ${articleFor(s.name)} ${s.name}`
  return `${base} — ${whenSuffix(s)}`
}
```

Results:
- `🐦 Natalie saw a Cardinal — July 5, 2026`
- `🐦 Natalie saw a Cardinal — July 5, 2026 · dawn` (with a time)
- `🦊 Natalie saw a critter — July 5, 2026` (unnamed)

`itemXml` already emits `<title>${xmlEscape(titleFor(s))}</title>`, so the whole
title — including `sightedTime` — is escaped exactly once. The `—` (em dash) and
`·` (middot) are not XML-special and pass through. `articleFor`, `formatDate`,
`descriptionHtml`, `pubDate`, `guid`, `enclosure`, and the channel are unchanged.

## Testing (`buildFeed.test.ts` + `routes.test.ts`, updated)

- Every existing title assertion gains the ` — July 5, 2026` suffix (the
  `sighting()` fixture defaults `sightedOn` to `2026-07-05` with no time):
  named (`a Mr Fox`), the article cases (`a Cardinal`, `an Owl`, `a Fox`),
  unnamed (`a critter`), and the escaped-name case
  (`Tom &amp; &lt;Jerry&gt; — July 5, 2026`).
- Add a title test with a `sightedTime`:
  `🦊 Natalie saw a Mr Fox — July 5, 2026 · dawn`.
- `routes.test.ts`: update its single title assertion to include the suffix
  (`🦊 Natalie saw a Mr Fox — July 5, 2026`).
- The description-date, escaping, enclosure, empty-feed, and RFC-822 pubDate
  tests are unchanged.

## Out of scope

Removing the description date line · changing the date format or separators ·
changing `pubDate` · any app UI change.

## Definition of done

- Feed item titles read `<emoji> Natalie saw <a/an> <name> — <date>` (with
  ` · <time>` when a time is set), for named and unnamed sightings.
- The description still carries its `📅` date line.
- Full suite, lint, typecheck, build green; CI green on the PR.
