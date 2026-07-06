# RSS Title Article + Description Date Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Feed titles read "Natalie saw a Cardinal" / "an Owl", and every item's description shows the sighting date. Per `docs/superpowers/specs/2026-07-06-rss-title-and-date-design.md`.

**Architecture:** Two pure helpers added to `app/server/feed/buildFeed.ts` — `articleFor(name)` (vowel-letter → "an"/"a") used in `titleFor`, and `formatDate(sightedOn)` (parses `YYYY-MM-DD`, no `Date`/timezone) used in a new always-present description date line. No route, wiring, or dependency changes.

**Tech Stack:** TypeScript, Vitest 4. **No new dependencies. Single source file + its test.**

**Spec:** `docs/superpowers/specs/2026-07-06-rss-title-and-date-design.md`

## Global Constraints

- pnpm from `app/`; raw vitest needs `NODE_OPTIONS=--no-experimental-webstorage` prefix; server imports use `.js` extensions; no new dependencies.
- Named title: `${emoji} Natalie saw ${articleFor(name)} ${name}`; unnamed unchanged: `${emoji} Natalie saw a critter`. Article always prepends (accept "a Mr Fox").
- `articleFor` = `/^[aeiou]/i.test(name) ? 'an' : 'a'`. `formatDate('2026-07-05')` = `"July 5, 2026"` (no `Date`, no timezone).
- Description gains an always-present date line `<p>📅 …</p>` combining the time when present (`July 5, 2026 · <time>`); order: place, date/time, comment, photo. Every item therefore now has a `<description>`.
- Unchanged: `pubDate` (RFC-822 from sightedOn), `guid`, `enclosure`, channel, escaping, no-naked-ampersand behavior.

---

### Task 1: article in title + date in description

**Files:**
- Modify: `app/server/feed/buildFeed.ts`
- Test: `app/server/feed/buildFeed.test.ts`, `app/server/feed/routes.test.ts` (one assertion — the title it checks now has the article)

**Interfaces:**
- Internal to `buildFeed.ts`: `articleFor(name: string): string`, `formatDate(sightedOn: string): string`. `buildFeed`'s public signature is unchanged.

- [ ] **Step 1: Update the tests (RED)**

In `app/server/feed/buildFeed.test.ts`, change the named-title assertion (currently `'<title>🦊 Natalie saw Mr Fox</title>'`) to expect the article:

```ts
    expect(xml).toContain('<title>🦊 Natalie saw a Mr Fox</title>')
```

Append these article tests inside the `describe('buildFeed', …)` block:

```ts
  it('prepends "a" before a consonant name and "an" before a vowel name', () => {
    expect(buildFeed([sighting({ emoji: '🐦', name: 'Cardinal' })], SITE)).toContain(
      '<title>🐦 Natalie saw a Cardinal</title>',
    )
    expect(buildFeed([sighting({ emoji: '🦉', name: 'Owl' })], SITE)).toContain(
      '<title>🦉 Natalie saw an Owl</title>',
    )
    expect(buildFeed([sighting({ name: 'Fox' })], SITE)).toContain(
      '<title>🦊 Natalie saw a Fox</title>',
    )
  })
```

(The existing unnamed test — `'<title>🦊 Natalie saw a critter</title>'` — stays as-is and must keep passing.)

Add date-line tests:

```ts
  it('always shows the sighting date in the description', () => {
    const xml = buildFeed([sighting({ sightedOn: '2026-07-05' })], SITE)
    expect(xml).toContain('<p>📅 July 5, 2026</p>')
  })

  it('combines the date and time on one line when a time is present', () => {
    const xml = buildFeed([sighting({ sightedOn: '2026-07-05', sightedTime: 'dawn' })], SITE)
    expect(xml).toContain('<p>📅 July 5, 2026 · dawn</p>')
  })
```

Replace the existing "has no enclosure or item description when there is no photo, place, comment, or time" test — the description now always carries the date line — with:

```ts
  it('a bare sighting still gets a description carrying just the date line', () => {
    const xml = buildFeed([sighting()], SITE)
    expect(xml).not.toContain('<enclosure')
    expect(xml).toContain('<description><![CDATA[')
    expect(xml).toContain('<p>📅 July 5, 2026</p>')
    expect(xml).not.toContain('📍') // no place line
    expect(xml).not.toContain('<img') // no photo
  })
```

Also update the "renders place, time, and comment" test: the time now appears on the date line, so change its `sightedTime: 'dawn'` expectation from a standalone check to the combined line. Replace `expect(xml).toContain('dawn')` in that test with:

```ts
    expect(xml).toContain('📅 July 5, 2026 · dawn')
```

(`sighting()` defaults `sightedOn` to `'2026-07-05'`, so the date is `July 5, 2026`.)

Also in `app/server/feed/routes.test.ts`, the route test asserts the rendered title, which now has the article. Change line 49's assertion:

```ts
      expect(body).toContain('🦊 Natalie saw a Mr Fox')
```

- [ ] **Step 2: Run to verify failure**

Run (from `app/`): `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project unit server/feed/buildFeed.test.ts`
Expected: FAIL — titles lack the article; no `📅` date line.

- [ ] **Step 3: Add the helpers and use them**

In `app/server/feed/buildFeed.ts`:

Add `articleFor` near `titleFor`, and update `titleFor`:

```ts
function articleFor(name: string): string {
  return /^[aeiou]/i.test(name) ? 'an' : 'a'
}

function titleFor(s: Sighting): string {
  return s.name === null
    ? `${s.emoji} Natalie saw a critter`
    : `${s.emoji} Natalie saw ${articleFor(s.name)} ${s.name}`
}
```

Add the `MONTHS` table and `formatDate` (place them near `rfc822`):

```ts
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** "2026-07-05" → "July 5, 2026". Parses the string directly — no Date, no timezone. */
function formatDate(sightedOn: string): string {
  const [year, month, day] = sightedOn.split('-')
  return `${MONTHS[Number(month) - 1]} ${Number(day)}, ${year}`
}
```

Replace `descriptionHtml` with the version that always emits the date line (combining the time when present):

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

(The `desc === '' ? '' : …` guard in `itemXml` stays — it just never triggers now, which is fine.)

- [ ] **Step 4: Run to verify pass**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project unit server/feed/buildFeed.test.ts`
Expected: all PASS.

- [ ] **Step 5: Full verification**

Run: `pnpm test && pnpm lint && pnpm typecheck && pnpm build`
Expected: all green (integration needs Docker). The route test's title assertion was updated in Step 1 to include the article.

- [ ] **Step 6: Commit**

```bash
git add server/feed/buildFeed.ts server/feed/buildFeed.test.ts server/feed/routes.test.ts
git commit -m "feat: article in RSS titles and a date line in item descriptions"
```
