# RSS Date/Time in Item Title Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Feed item titles show the sighting date (and time when present) so subscribers see it at a glance. Per `docs/superpowers/specs/2026-07-06-rss-title-datetime-design.md`.

**Architecture:** One function changes in `app/server/feed/buildFeed.ts` — `titleFor` appends a ` — <date>` (or ` — <date> · <time>`) suffix built from the existing `formatDate`; a small `whenSuffix` helper is added. `sightedTime` rides in raw and is escaped once by the existing outer `xmlEscape(titleFor(...))`. Nothing else changes.

**Tech Stack:** TypeScript, Vitest 4. **No new dependencies. One source file + two test files.**

**Spec:** `docs/superpowers/specs/2026-07-06-rss-title-datetime-design.md`

## Global Constraints

- pnpm from `app/`; raw vitest needs `NODE_OPTIONS=--no-experimental-webstorage` prefix; server imports use `.js` extensions; no new dependencies.
- Title becomes `${base} — ${date}` or `${base} — ${date} · ${sightedTime}` when a time exists, for BOTH named and unnamed items. `base` is unchanged (`${emoji} Natalie saw ${article} ${name}` / `${emoji} Natalie saw a critter`).
- Separators exactly: ` — ` (space, em dash U+2014, space) before the date; ` · ` (space, middot U+00B7, space) before the time.
- `sightedTime` is appended RAW (no escaping inside `titleFor`) — `itemXml`'s existing `xmlEscape(titleFor(s))` escapes the whole title once.
- Unchanged: `articleFor`, `formatDate`, `descriptionHtml` (the `📅` line stays), `pubDate`, `guid`, `enclosure`, channel, escaping.

---

### Task 1: date/time suffix in the title

**Files:**
- Modify: `app/server/feed/buildFeed.ts`
- Test: `app/server/feed/buildFeed.test.ts`, `app/server/feed/routes.test.ts`

**Interfaces:**
- Internal to `buildFeed.ts`: add `whenSuffix(s: Sighting): string`; `titleFor` keeps its signature.

- [ ] **Step 1: Update the title assertions (RED)**

In `app/server/feed/buildFeed.test.ts`, append ` — July 5, 2026` inside each `</title>` — six assertions. Replace each old line with the new:

```ts
// line ~47
    expect(xml).toContain('<title>🦊 Natalie saw a Mr Fox — July 5, 2026</title>')
// line ~54
    expect(xml).toContain('<title>🦊 Natalie saw a critter — July 5, 2026</title>')
// line ~59
    expect(xml).toContain('<title>🦊 Natalie saw a Tom &amp; &lt;Jerry&gt; — July 5, 2026</title>')
// line ~66
      '<title>🐦 Natalie saw a Cardinal — July 5, 2026</title>',
// line ~69
      '<title>🦉 Natalie saw an Owl — July 5, 2026</title>',
// line ~72
      '<title>🦊 Natalie saw a Fox — July 5, 2026</title>',
```

Then append a new title-with-time test inside the `describe('buildFeed', …)` block:

```ts
  it('appends the time after the date in the title when a time is present', () => {
    const xml = buildFeed([sighting({ sightedTime: 'dawn' })], SITE)
    expect(xml).toContain('<title>🦊 Natalie saw a Mr Fox — July 5, 2026 · dawn</title>')
  })
```

In `app/server/feed/routes.test.ts`, update the single title assertion (line ~49) to include the suffix:

```ts
      expect(body).toContain('🦊 Natalie saw a Mr Fox — July 5, 2026')
```

- [ ] **Step 2: Run to verify failure**

Run (from `app/`): `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project unit server/feed`
Expected: FAIL — titles lack the ` — July 5, 2026` suffix; the with-time test fails too.

- [ ] **Step 3: Add `whenSuffix` and update `titleFor`**

In `app/server/feed/buildFeed.ts`, replace the existing `titleFor` with a `whenSuffix` helper plus the suffixed `titleFor` (place `whenSuffix` directly above `titleFor`):

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

(The ` — ` uses an em dash `—` (U+2014) and ` · ` a middot `·` (U+00B7), matching the tests. `formatDate` and `articleFor` already exist in this file.)

- [ ] **Step 4: Run to verify pass**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project unit server/feed`
Expected: all PASS.

- [ ] **Step 5: Full verification**

Run: `pnpm test && pnpm lint && pnpm typecheck && pnpm build`
Expected: all green (integration needs Docker).

- [ ] **Step 6: Commit**

```bash
git add server/feed/buildFeed.ts server/feed/buildFeed.test.ts server/feed/routes.test.ts
git commit -m "feat: show the sighting date and time in RSS item titles"
```
