# Custom Emoji Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 6 custom bird "emoji" (flat SVG images) Natalie can pick and log, each with a Unicode stand-in for text-only surfaces (RSS, push). Per `docs/superpowers/specs/2026-07-06-custom-emoji-design.md`.

**Architecture:** A static code catalogue (no DB) + a `custom:<slug>` token stored in the existing `sightings.emoji` text column. A `CritterGlyph` component resolves a token to its SVG `<img>` (Unicode passes through as text) and replaces every raw-emoji render site. Server surfaces (RSS/push) and both write routes resolve the token to its stand-in via a small server catalogue.

**Tech Stack:** React 19, Express 5, Vitest 4. **No new dependencies. No database change.**

**Spec:** `docs/superpowers/specs/2026-07-06-custom-emoji-design.md`

## Global Constraints

- pnpm from `app/`; raw vitest needs `NODE_OPTIONS=--no-experimental-webstorage` prefix; server imports use `.js` extensions; no raw hex in **TSX** (SVG asset files may use hex — they are static art, not TSX); no new dependencies.
- Token: `` `custom:${slug}` `` in `sightings.emoji`. Slugs: `robin, cardinal, blue-jay, chickadee, goldfinch, sparrow`; all stand-in `🐦`.
- Client catalogue exports: `CUSTOM: CustomEmoji[]`, `CUSTOM_PREFIX = 'custom:'`, `tokenFor(slug)`, `customFor(emoji): CustomEmoji | null`, `standInFor(emoji)`. `CustomEmoji = { slug, name, standIn }`.
- Server catalogue exports: `standInFor(emoji)`, `KNOWN_SLUGS: Set<string>`, `isKnownCustom(emoji): boolean`.
- Three catalogues (client list, server map, on-disk SVGs) must agree — the drift-sync test (Task 2) enforces it.
- Custom render leaks are the failure mode: a token printed as text reads `custom:robin`. Every glyph span → `CritterGlyph`; every `name ?? emoji` text fallback → `name ?? (nameFor(emoji) ?? emoji)`; CalendarPane's `.join('')` → per-sighting render.
- Both the sightings AND profiles POST routes share one emoji validator: length ≤ 40; a `custom:` value must be a known slug.

---

### Task 1: the six bird SVGs (art gate — do first)

**Files:**
- Create: `app/public/custom-emoji/robin.svg`, `cardinal.svg`, `blue-jay.svg`, `chickadee.svg`, `goldfinch.svg`, `sparrow.svg`

**Interfaces:**
- Produces: 6 static SVG assets at `/custom-emoji/<slug>.svg`. Task 2's drift test asserts they exist; Task 3 renders them.

Each SVG shares a flat songbird built from primitives (viewBox `0 0 64 64`, transparent background so it sits like an emoji), recolored + featured per species so they read distinctly at ~24px. Transcribe each file exactly.

- [ ] **Step 1: Create `robin.svg`** (brown back, orange breast)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="Robin">
  <path d="M18 40 L2 50 L16 53 Z" fill="#7d6c5c"/>
  <ellipse cx="30" cy="38" rx="16" ry="13" fill="#8a7a6b"/>
  <ellipse cx="35" cy="42" rx="11" ry="9" fill="#e2673a"/>
  <path d="M22 30 q11 3 15 15 q-11 2 -17 -5 Z" fill="#6f6155"/>
  <circle cx="42" cy="24" r="11" fill="#8a7a6b"/>
  <path d="M52 23 L61 25 L52 28 Z" fill="#f2b33a"/>
  <circle cx="45.5" cy="22" r="1.8" fill="#2a2320"/>
  <path d="M28 50 v6 M34 50 v6" stroke="#c98a3a" stroke-width="2" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 2: Create `cardinal.svg`** (all red, crest, black mask)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="Cardinal">
  <path d="M18 40 L2 50 L16 53 Z" fill="#b7332a"/>
  <ellipse cx="30" cy="38" rx="16" ry="13" fill="#cf3b2e"/>
  <path d="M22 30 q11 3 15 15 q-11 2 -17 -5 Z" fill="#b7332a"/>
  <circle cx="42" cy="24" r="11" fill="#cf3b2e"/>
  <path d="M40 15 L46 4 L50 16 Z" fill="#cf3b2e"/>
  <path d="M48 27 q-6 3 -8 -2 q4 -4 9 -2 Z" fill="#2a2320"/>
  <path d="M52 22 L62 25 L52 29 Z" fill="#f2b33a"/>
  <circle cx="45.5" cy="21" r="1.8" fill="#2a2320"/>
  <path d="M28 50 v6 M34 50 v6" stroke="#a05a34" stroke-width="2" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 3: Create `blue-jay.svg`** (blue back, white belly, crest)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="Blue Jay">
  <path d="M18 40 L2 50 L16 53 Z" fill="#3f6fb0"/>
  <ellipse cx="30" cy="38" rx="16" ry="13" fill="#5b8bd0"/>
  <ellipse cx="35" cy="43" rx="11" ry="8" fill="#f4f1ea"/>
  <path d="M22 30 q11 3 15 15 q-11 2 -17 -5 Z" fill="#3f6fb0"/>
  <circle cx="42" cy="24" r="11" fill="#5b8bd0"/>
  <path d="M40 15 L46 5 L50 16 Z" fill="#5b8bd0"/>
  <path d="M33 30 q9 3 17 0" stroke="#2a2320" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M52 22 L62 25 L52 29 Z" fill="#2a2320"/>
  <circle cx="45.5" cy="21" r="1.8" fill="#2a2320"/>
  <path d="M28 50 v6 M34 50 v6" stroke="#4a4a4a" stroke-width="2" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 4: Create `chickadee.svg`** (gray, black cap + bib, white cheek)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="Chickadee">
  <path d="M18 40 L2 50 L16 53 Z" fill="#8a847c"/>
  <ellipse cx="30" cy="38" rx="16" ry="13" fill="#9a938b"/>
  <ellipse cx="35" cy="43" rx="11" ry="8" fill="#f4f1ea"/>
  <path d="M22 30 q11 3 15 15 q-11 2 -17 -5 Z" fill="#7a736b"/>
  <circle cx="42" cy="24" r="11" fill="#f4f1ea"/>
  <path d="M31 22 a11 11 0 0 1 22 0 Z" fill="#2a2320"/>
  <path d="M38 32 q5 3 10 1 q-2 5 -9 2 Z" fill="#2a2320"/>
  <path d="M52 23 L61 25 L52 28 Z" fill="#2a2320"/>
  <circle cx="45.5" cy="21" r="1.7" fill="#2a2320"/>
  <path d="M28 50 v6 M34 50 v6" stroke="#5a5148" stroke-width="2" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 5: Create `goldfinch.svg`** (yellow body, black cap + wing)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="Goldfinch">
  <path d="M18 40 L2 50 L16 53 Z" fill="#2a2320"/>
  <ellipse cx="30" cy="38" rx="16" ry="13" fill="#f2cf3a"/>
  <path d="M22 29 q12 3 16 16 q-12 2 -18 -5 Z" fill="#2a2320"/>
  <circle cx="42" cy="24" r="11" fill="#f2cf3a"/>
  <path d="M35 18 a11 11 0 0 1 14 -2 L37 22 Z" fill="#2a2320"/>
  <path d="M52 23 L61 25 L52 28 Z" fill="#f0932a"/>
  <circle cx="45.5" cy="22" r="1.7" fill="#2a2320"/>
  <path d="M28 50 v6 M34 50 v6" stroke="#c98a3a" stroke-width="2" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 6: Create `sparrow.svg`** (streaky brown, rufous cap, pale belly)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="Sparrow">
  <path d="M18 40 L2 50 L16 53 Z" fill="#7a5f3f"/>
  <ellipse cx="30" cy="38" rx="16" ry="13" fill="#9c7a52"/>
  <ellipse cx="35" cy="43" rx="11" ry="8" fill="#d9c6a8"/>
  <path d="M22 30 q11 3 15 15 q-11 2 -17 -5 Z" fill="#6f5636"/>
  <circle cx="42" cy="24" r="11" fill="#9c7a52"/>
  <path d="M31 22 a11 11 0 0 1 22 0 Z" fill="#a05a34"/>
  <path d="M52 23 L61 25 L52 28 Z" fill="#6b5537"/>
  <circle cx="45.5" cy="21" r="1.7" fill="#2a2320"/>
  <path d="M28 50 v6 M34 50 v6" stroke="#8a6a44" stroke-width="2" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 7: Verify the assets render and commit**

Run (from `app/`): `ls public/custom-emoji/ && head -1 public/custom-emoji/robin.svg`
Expected: six `.svg` files listed; each starts with the `<svg …>` tag. (The controller reviews them visually at size in the task review — this is the art gate; if any bird is unrecognizable, iterate here before proceeding.)

```bash
git add public/custom-emoji/
git commit -m "feat: add six flat-SVG bird emoji assets"
```

---

### Task 2: catalogues, `nameFor`, and the drift-sync test

**Files:**
- Create: `app/src/lib/customEmoji.ts`, `app/src/lib/customEmoji.test.ts`, `app/server/customEmoji.ts`, `app/server/customEmoji.test.ts`
- Modify: `app/src/lib/critters.ts`, `app/src/lib/critters.test.ts`

**Interfaces:**
- Consumes: the SVG files from Task 1.
- Produces:
  - Client `customEmoji.ts`: `type CustomEmoji = { slug: string; name: string; standIn: string }`, `CUSTOM: CustomEmoji[]`, `CUSTOM_PREFIX = 'custom:'`, `tokenFor(slug: string): string`, `customFor(emoji: string): CustomEmoji | null`, `standInFor(emoji: string): string`.
  - Server `customEmoji.ts`: `KNOWN_SLUGS: Set<string>`, `isKnownCustom(emoji: string): boolean`, `standInFor(emoji: string): string`.
  - `nameFor(emoji)` (critters.ts) resolves custom names too.

- [ ] **Step 1: Write the failing client catalogue test**

Create `app/src/lib/customEmoji.test.ts`:

```ts
import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CUSTOM, CUSTOM_PREFIX, customFor, standInFor, tokenFor } from './customEmoji'

describe('customEmoji catalogue', () => {
  it('round-trips slug ↔ token and resolves known tokens', () => {
    expect(tokenFor('robin')).toBe('custom:robin')
    expect(customFor('custom:robin')?.name).toBe('Robin')
    expect(customFor('robin')).toBeNull() // bare slug is not a token
    expect(customFor('🦊')).toBeNull()
    expect(customFor('custom:unknown')).toBeNull()
  })

  it('standInFor maps known tokens to the stand-in and passes emoji through', () => {
    expect(standInFor('custom:robin')).toBe('🐦')
    expect(standInFor('🦊')).toBe('🦊')
    expect(standInFor('custom:unknown')).toBe('🐦') // fallback for an unknown custom token
  })

  it('every catalogue slug has an on-disk SVG (drift guard)', () => {
    const files = new Set(readdirSync(new URL('../../public/custom-emoji/', import.meta.url)))
    for (const c of CUSTOM) expect(files.has(`${c.slug}.svg`)).toBe(true)
  })

  it('slugs are lowercase and the prefix is stable', () => {
    expect(CUSTOM_PREFIX).toBe('custom:')
    for (const c of CUSTOM) expect(c.slug).toMatch(/^[a-z-]+$/)
  })

  // Pinned slug list — the server test (Task 2) pins the SAME list, so adding a
  // bird to one side without the other fails a test (client↔server drift guard).
  it('exposes exactly the shipped slug set', () => {
    expect(CUSTOM.map((c) => c.slug)).toEqual([
      'robin', 'cardinal', 'blue-jay', 'chickadee', 'goldfinch', 'sparrow',
    ])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client src/lib/customEmoji.test.ts`
Expected: FAIL — `./customEmoji` not found.

- [ ] **Step 3: Implement the client catalogue**

Create `app/src/lib/customEmoji.ts`:

```ts
export type CustomEmoji = { slug: string; name: string; standIn: string }

export const CUSTOM_PREFIX = 'custom:'

export const CUSTOM: CustomEmoji[] = [
  { slug: 'robin', name: 'Robin', standIn: '🐦' },
  { slug: 'cardinal', name: 'Cardinal', standIn: '🐦' },
  { slug: 'blue-jay', name: 'Blue Jay', standIn: '🐦' },
  { slug: 'chickadee', name: 'Chickadee', standIn: '🐦' },
  { slug: 'goldfinch', name: 'Goldfinch', standIn: '🐦' },
  { slug: 'sparrow', name: 'Sparrow', standIn: '🐦' },
]

const BY_SLUG = new Map(CUSTOM.map((c) => [c.slug, c]))

export function tokenFor(slug: string): string {
  return `${CUSTOM_PREFIX}${slug}`
}

/** A known `custom:<slug>` token → its entry; anything else → null. */
export function customFor(emoji: string): CustomEmoji | null {
  if (!emoji.startsWith(CUSTOM_PREFIX)) return null
  return BY_SLUG.get(emoji.slice(CUSTOM_PREFIX.length)) ?? null
}

/** For text-only surfaces: a custom token → its stand-in (unknown custom → 🐦);
 *  a normal emoji passes through unchanged. */
export function standInFor(emoji: string): string {
  if (!emoji.startsWith(CUSTOM_PREFIX)) return emoji
  return customFor(emoji)?.standIn ?? '🐦'
}
```

- [ ] **Step 4: Run to verify pass**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client src/lib/customEmoji.test.ts`
Expected: PASS.

- [ ] **Step 5: Extend `nameFor` for custom names (TDD)**

Append to `app/src/lib/critters.test.ts` (inside the `nameFor` describe):

```ts
  it('resolves custom-emoji names from their token', () => {
    expect(nameFor('custom:robin')).toBe('Robin')
    expect(nameFor('custom:blue-jay')).toBe('Blue Jay')
    expect(nameFor('custom:unknown')).toBeNull()
  })
```

Run it (FAIL), then in `app/src/lib/critters.ts` add the import and update `nameFor`:

```ts
import { customFor } from './customEmoji'
```

```ts
export function nameFor(emoji: string): string | null {
  const custom = customFor(emoji)
  if (custom !== null) return custom.name
  return CURATED.find((c) => c.emoji === emoji)?.name ?? null
}
```

Re-run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client src/lib/critters.test.ts` → PASS.

- [ ] **Step 6: Write the failing server catalogue test**

Create `app/server/customEmoji.test.ts`:

```ts
import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { KNOWN_SLUGS, isKnownCustom, standInFor } from './customEmoji.js'

describe('server customEmoji', () => {
  it('standInFor maps known tokens and passes emoji through', () => {
    expect(standInFor('custom:cardinal')).toBe('🐦')
    expect(standInFor('🦊')).toBe('🦊')
    expect(standInFor('custom:unknown')).toBe('🐦')
  })

  it('isKnownCustom accepts known tokens, rejects unknown and non-custom', () => {
    expect(isKnownCustom('custom:robin')).toBe(true)
    expect(isKnownCustom('custom:unknown')).toBe(false)
    expect(isKnownCustom('🦊')).toBe(false)
  })

  it('known slugs match the on-disk SVG files (drift guard)', () => {
    const files = new Set(readdirSync(new URL('../public/custom-emoji/', import.meta.url)))
    for (const slug of KNOWN_SLUGS) expect(files.has(`${slug}.svg`)).toBe(true)
  })

  // Same pinned list as the client catalogue test — keeps the two catalogues in
  // sync so a client-only bird can't be picked-yet-rejected by the server.
  it('knows exactly the shipped slug set', () => {
    expect([...KNOWN_SLUGS].sort()).toEqual(
      ['blue-jay', 'cardinal', 'chickadee', 'goldfinch', 'robin', 'sparrow'].sort(),
    )
  })
})
```

- [ ] **Step 7: Run to verify failure, then implement the server catalogue**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project unit server/customEmoji.test.ts`
Expected: FAIL — `./customEmoji.js` not found.

Create `app/server/customEmoji.ts`:

```ts
const CUSTOM_PREFIX = 'custom:'

/** slug → Unicode stand-in for text-only surfaces (RSS titles, push). */
const STAND_INS: Record<string, string> = {
  robin: '🐦',
  cardinal: '🐦',
  'blue-jay': '🐦',
  chickadee: '🐦',
  goldfinch: '🐦',
  sparrow: '🐦',
}

export const KNOWN_SLUGS = new Set(Object.keys(STAND_INS))

export function isKnownCustom(emoji: string): boolean {
  return emoji.startsWith(CUSTOM_PREFIX) && KNOWN_SLUGS.has(emoji.slice(CUSTOM_PREFIX.length))
}

/** Custom token → stand-in (unknown custom → 🐦); normal emoji passes through. */
export function standInFor(emoji: string): string {
  if (!emoji.startsWith(CUSTOM_PREFIX)) return emoji
  return STAND_INS[emoji.slice(CUSTOM_PREFIX.length)] ?? '🐦'
}
```

Re-run: PASS.

- [ ] **Step 8: Full check and commit**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client src/lib/customEmoji.test.ts src/lib/critters.test.ts && NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project unit server/customEmoji.test.ts && pnpm lint && pnpm typecheck`
Expected: all green.

```bash
git add src/lib/customEmoji.ts src/lib/customEmoji.test.ts src/lib/critters.ts src/lib/critters.test.ts server/customEmoji.ts server/customEmoji.test.ts
git commit -m "feat: custom-emoji catalogues (client + server) and nameFor resolution"
```

---

### Task 3: `CritterGlyph` and every render site

**Files:**
- Create: `app/src/components/CritterGlyph.tsx`, `app/src/components/CritterGlyph.test.tsx`
- Modify: `app/src/components/EmojiPicker.tsx`, `app/src/components/SightingRow.tsx`, `app/src/components/SightingDetail.tsx`, `app/src/components/DetailsForm.tsx`, `app/src/components/LeaderboardList.tsx`, `app/src/components/CalendarPane.tsx`, `app/src/index.css`
- Test: `app/src/components/CalendarPane.test.tsx`, `app/src/components/SightingRow.test.tsx` (append)

**Interfaces:**
- Consumes: `customFor` (Task 2), `nameFor` (Task 2).
- Produces: `CritterGlyph({ emoji, className }): JSX` — `<img class src alt>` for a known token, `<span aria-hidden>{emoji}</span>` otherwise.

- [ ] **Step 1: Write the failing CritterGlyph test**

Create `app/src/components/CritterGlyph.test.tsx`:

```tsx
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CritterGlyph } from './CritterGlyph'

describe('CritterGlyph', () => {
  it('renders an img with the slug src for a known custom token', () => {
    const { container } = render(<CritterGlyph emoji="custom:robin" className="x" />)
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('src')).toBe('/custom-emoji/robin.svg')
    expect(img?.getAttribute('class')).toContain('x')
  })

  it('renders a text span for a Unicode emoji', () => {
    const { container } = render(<CritterGlyph emoji="🦊" className="x" />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toBe('🦊')
  })
})
```

- [ ] **Step 2: Run to verify failure, then implement**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client src/components/CritterGlyph.test.tsx`
Expected: FAIL — `./CritterGlyph` not found.

Create `app/src/components/CritterGlyph.tsx`:

```tsx
import { customFor } from '../lib/customEmoji'

/** Renders a critter's glyph: a custom-emoji token as its SVG image, or a
 *  Unicode emoji as text (unchanged from before custom emoji existed). The
 *  image is decorative (alt="") — callers carry the accessible name. */
export function CritterGlyph({ emoji, className }: { emoji: string; className?: string }) {
  const custom = customFor(emoji)
  if (custom !== null) {
    return <img className={className} src={`/custom-emoji/${custom.slug}.svg`} alt="" />
  }
  return (
    <span className={className} aria-hidden="true">
      {emoji}
    </span>
  )
}
```

Re-run: PASS.

- [ ] **Step 3: Add the glyph CSS**

Append to `app/src/index.css`:

```css
/* Custom-emoji images sit in the same box as a text emoji at each site. */
img.details-emoji,
img.detail-emoji,
img.leader-emoji,
img.recent-emoji {
  width: 1.15em;
  height: 1.15em;
  object-fit: contain;
  vertical-align: -0.2em;
}

.day-emoji img {
  width: 1em;
  height: 1em;
  object-fit: contain;
  vertical-align: -0.15em;
}

.picker-tile img {
  width: 1.6em;
  height: 1.6em;
  object-fit: contain;
}
```

(The `1.15em`/`1.6em` factors approximate emoji's built-in padding; the visual gate in Step 8 confirms/adjusts them.)

- [ ] **Step 4: Swap the dedicated glyph spans**

Replace each raw-emoji span with `<CritterGlyph>` (add `import { CritterGlyph } from './CritterGlyph'` to each file):

`EmojiPicker.tsx` — friend tile (was `<span aria-hidden="true">{profile.emoji}</span>`), recent tile (`{emoji}`), curated tile (`{c.emoji}`), extended tile (`{emoji}`) all become e.g. `<CritterGlyph emoji={profile.emoji} />` / `<CritterGlyph emoji={emoji} />` / `<CritterGlyph emoji={c.emoji} />`. (The `PickerTile` children slot takes it directly.)

`DetailsForm.tsx:100` — `<span className="details-emoji" aria-hidden="true">{emoji}</span>` → `<CritterGlyph emoji={emoji} className="details-emoji" />`.

`SightingDetail.tsx:106` — `<span className="detail-emoji" aria-hidden="true">{sighting.emoji}</span>` → `<CritterGlyph emoji={sighting.emoji} className="detail-emoji" />`.

`LeaderboardList.tsx:34-36` — the `<span className="leader-emoji" aria-hidden="true">{row.emoji}</span>` → `<CritterGlyph emoji={row.emoji} className="leader-emoji" />`.

`SightingRow.tsx:9` — `<span className="recent-emoji" aria-hidden="true">{sighting.emoji}</span>` → `<CritterGlyph emoji={sighting.emoji} className="recent-emoji" />`.

- [ ] **Step 5: Fix the text fallbacks (so a null-name custom row shows "Robin")**

Add `import { nameFor } from '../lib/critters'` where needed, then:

`SightingRow.tsx:12` — `{sighting.name ?? sighting.emoji}` → `{sighting.name ?? (nameFor(sighting.emoji) ?? sighting.emoji)}`.

`SightingDetail.tsx:107` — `<h2>{sighting.name ?? sighting.emoji}</h2>` → `<h2>{sighting.name ?? (nameFor(sighting.emoji) ?? sighting.emoji)}</h2>`.

`SightingDetail.tsx:120` — `alt={sighting.name ?? \`${sighting.emoji} sighting\`}` → `alt={sighting.name ?? (nameFor(sighting.emoji) ?? \`${sighting.emoji} sighting\`)}`.

- [ ] **Step 6: Refactor CalendarPane (render each sighting, not a joined string)**

In `app/src/components/CalendarPane.tsx`, replace the join + span (lines ~59-69). Remove the `const emoji = …join('')` line and render per-sighting glyphs:

```tsx
          const shown = cell.sightings.slice(0, 2)
          const overflow = cell.sightings.length - 2
          const body = (
            <>
              <span className="day-num">{cell.dayOfMonth}</span>
              {cell.inMonth && cell.sightings.length > 0 && (
                <span className="day-emoji">
                  {shown.map((s) => (
                    <CritterGlyph key={s.id} emoji={s.emoji} />
                  ))}
                  {overflow > 0 ? ` +${overflow}` : ''}
                </span>
              )}
            </>
          )
```

Add `import { CritterGlyph } from './CritterGlyph'` to CalendarPane.

- [ ] **Step 7: Write the render-behaviour tests**

Append to `app/src/components/CalendarPane.test.tsx` a test that a day with two custom sightings renders two images (mirror the file's existing setup for building a month with sightings; use `makeSighting({ emoji: 'custom:robin', sightedOn: <a day> })` and `custom:cardinal` on the same day):

```tsx
  it('renders a custom-emoji day as images, not the raw token text', () => {
    // (build the calendar for the month containing the two sightings, per this file's helper)
    // then locate that day cell and assert:
    const imgs = document.querySelectorAll('.day-emoji img')
    expect(imgs.length).toBe(2)
    expect(document.body.textContent).not.toContain('custom:robin')
  })
```

Append to `app/src/components/SightingRow.test.tsx` a null-name custom fallback test:

```tsx
  it('shows the resolved custom name (not the token) when the name is null', () => {
    render(<SightingRow sighting={makeSighting({ emoji: 'custom:robin', name: null })} onSelect={() => {}} />)
    expect(screen.getByText('Robin')).toBeInTheDocument()
    expect(screen.queryByText('custom:robin')).not.toBeInTheDocument()
  })
```

(Match each test file's existing imports/harness — `makeSighting`, `render`, `screen`.)

- [ ] **Step 8: Verify (incl. the visual gate) and commit**

Run: `pnpm test && pnpm lint && pnpm typecheck && pnpm build`
Expected: all green.

**Visual gate (required — jsdom cannot measure this):** run the app (`docker compose up -d --build`, or `pnpm dev`) and confirm a `custom:robin` sighting shows the robin image, correctly sized and baseline-aligned, in: the picker Birds tile (Task 4), a calendar day, a history row, sighting detail, and the leaderboard — in light and dark. Adjust the Step-3 `em` factors if the image reads too large/small or misaligned. Note what you checked in the task report.

```bash
git add src/components/CritterGlyph.tsx src/components/CritterGlyph.test.tsx src/components/EmojiPicker.tsx src/components/SightingRow.tsx src/components/SightingRow.test.tsx src/components/SightingDetail.tsx src/components/DetailsForm.tsx src/components/LeaderboardList.tsx src/components/CalendarPane.tsx src/components/CalendarPane.test.tsx src/index.css
git commit -m "feat: render custom-emoji images across the app via CritterGlyph"
```

---

### Task 4: the picker "Birds" section

**Files:**
- Modify: `app/src/components/EmojiPicker.tsx`
- Test: `app/src/components/LogSightingFlow.test.tsx` (append) or `EmojiPicker`'s existing test file

**Interfaces:**
- Consumes: `CUSTOM`/`tokenFor` (Task 2), `CritterGlyph` (Task 3), the existing `onPick(emoji, name)` prop.
- Produces: a Birds section in the picker that logs `custom:<slug>` with the name.

- [ ] **Step 1: Write the failing picker test**

Append to `app/src/components/LogSightingFlow.test.tsx` (it renders the flow → picker; mirror its harness, and remember the entry auth gate — `renderFlow` seeds credentials by default):

```tsx
  it('has a Birds section; picking Robin advances with the name pre-filled', async () => {
    renderFlow()
    await userEvent.click(screen.getByRole('button', { name: 'Robin' }))
    expect(screen.getByLabelText(/critter name/i)).toHaveValue('Robin')
  })
```

- [ ] **Step 2: Run to verify failure**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client src/components/LogSightingFlow.test.tsx`
Expected: FAIL — no "Robin" button.

- [ ] **Step 3: Add the Birds section to `EmojiPicker`**

In `app/src/components/EmojiPicker.tsx`, add the import `import { CUSTOM, tokenFor } from '../lib/customEmoji'`, and render a Birds section above the curated grid (mirroring the Recently-seen section's markup/classes). Each tile:

```tsx
      <h3 className="picker-recent-heading">Birds</h3>
      <div className="picker-grid picker-grid-recent">
        {CUSTOM.map((c) => (
          <PickerTile key={c.slug} ariaLabel={c.name} onClick={() => onPick(tokenFor(c.slug), c.name)}>
            <CritterGlyph emoji={tokenFor(c.slug)} />
          </PickerTile>
        ))}
      </div>
```

(`CritterGlyph` is already imported from Task 3. The name-prefill works because `onPick` passes `c.name`, exactly like curated tiles.)

- [ ] **Step 4: Run to verify pass, then full check**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client src/components/LogSightingFlow.test.tsx && pnpm lint && pnpm typecheck`
Expected: PASS/green.

- [ ] **Step 5: Commit**

```bash
git add src/components/EmojiPicker.tsx src/components/LogSightingFlow.test.tsx
git commit -m "feat: Birds section in the emoji picker for custom emoji"
```

---

### Task 5: server — shared emoji validation + RSS/push stand-ins

**Files:**
- Create: `app/server/emojiField.ts` (shared validator), `app/server/emojiField.test.ts`
- Modify: `app/server/sightings/routes.ts`, `app/server/profiles/routes.ts`, `app/server/feed/buildFeed.ts`, `app/server/push/notifier.ts`
- Test: `app/server/sightings/routes.test.ts`, `app/server/profiles/routes.test.ts`, `app/server/feed/buildFeed.test.ts`, `app/server/push/notifier.test.ts` (append)

**Interfaces:**
- Consumes: `isKnownCustom`, `standInFor` (Task 2 server catalogue).
- Produces: `validateEmoji(value: unknown): string | null` — returns an error string or null.

- [ ] **Step 1: Write the failing shared-validator test**

Create `app/server/emojiField.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { validateEmoji } from './emojiField.js'

describe('validateEmoji', () => {
  it('accepts a normal emoji and a known custom token', () => {
    expect(validateEmoji('🦊')).toBeNull()
    expect(validateEmoji('custom:robin')).toBeNull()
  })
  it('rejects empty, over-length, non-string, and unknown custom tokens', () => {
    expect(validateEmoji('')).not.toBeNull()
    expect(validateEmoji(42)).not.toBeNull()
    expect(validateEmoji('x'.repeat(41))).not.toBeNull()
    expect(validateEmoji('custom:unknown')).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify failure, then implement the validator**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project unit server/emojiField.test.ts`
Expected: FAIL — module not found.

Create `app/server/emojiField.ts`:

```ts
import { isKnownCustom } from './customEmoji.js'

const CUSTOM_PREFIX = 'custom:'

/** Shared emoji validation for the sightings and profiles POST routes.
 *  Returns an error message, or null when valid. */
export function validateEmoji(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 40) {
    return 'required, 1-40 characters'
  }
  if (value.startsWith(CUSTOM_PREFIX) && !isKnownCustom(value)) {
    return 'unknown custom emoji'
  }
  return null
}
```

Re-run: PASS.

- [ ] **Step 3: Use the validator in both routes**

In `app/server/sightings/routes.ts`, replace the inline emoji check:

```ts
  const emoji = record.emoji
  const emojiError = validateEmoji(emoji)
  if (emojiError !== null) details.emoji = emojiError
```

(add `import { validateEmoji } from '../emojiField.js'`).

In `app/server/profiles/routes.ts`, the same replacement for its emoji check (add the same import). Both previously used `length === 0 || length > 16` with message `'required, 1-16 characters'`.

**Update the now-stale existing tests:** both `sightings/routes.test.ts:124` and `profiles/routes.test.ts:99` have an `['emoji too long', { … emoji: 'x'.repeat(17) … }, 'emoji']` case. 17 chars is now VALID under the ≤40 cap, so change each `'x'.repeat(17)` to `'x'.repeat(41)` (they assert `details.emoji` is defined via `toBeDefined()`, so only the length input changes).

- [ ] **Step 4: Append route tests for custom tokens**

In `app/server/sightings/routes.test.ts` (POST describe) and `app/server/profiles/routes.test.ts` (POST describe), add cases: a known `custom:robin` emoji → 201; an unknown `custom:nope` → 400 with `details.emoji`; an over-length emoji (`'x'.repeat(41)`) → 400. Mirror each file's existing `post`/`withServer` harness.

```ts
  it('accepts a known custom emoji token and rejects an unknown one', async () => {
    // sightings example (adapt VALID/appWith to each file):
    await withServer(appWith(fakeStore()), async (base) => {
      const ok = await fetch(`${base}/api/sightings`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ emoji: 'custom:robin', sightedOn: '2026-07-05' }),
      })
      expect(ok.status).toBe(201)
      const bad = await fetch(`${base}/api/sightings`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ emoji: 'custom:nope', sightedOn: '2026-07-05' }),
      })
      expect(bad.status).toBe(400)
    })
  })
```

- [ ] **Step 5: RSS + push use the stand-in (TDD)**

Append to `app/server/feed/buildFeed.test.ts`:

```ts
  it('uses the Unicode stand-in for a custom emoji in the title', () => {
    const xml = buildFeed([sighting({ emoji: 'custom:robin', name: 'Robin' })], SITE)
    expect(xml).toContain('<title>🐦 Natalie saw a Robin — July 5, 2026</title>')
    expect(xml).not.toContain('custom:robin')
  })
```

Append to `app/server/push/notifier.test.ts`:

```ts
  it('uses the stand-in for a custom emoji in the push title', () => {
    const payload = JSON.parse(payloadFor(sighting({ emoji: 'custom:robin', name: 'Robin' }))) as { title: string }
    expect(payload.title).toBe('🐦 Natalie saw Robin!')
  })
```

Run both (FAIL), then implement:

In `app/server/feed/buildFeed.ts`, add `import { standInFor } from '../customEmoji.js'` and change `titleFor` to use `standInFor(s.emoji)` in place of `s.emoji`:

```ts
function titleFor(s: Sighting): string {
  const glyph = standInFor(s.emoji)
  const base =
    s.name === null
      ? `${glyph} Natalie saw a critter`
      : `${glyph} Natalie saw ${articleFor(s.name)} ${s.name}`
  return `${base} — ${whenSuffix(s)}`
}
```

In `app/server/push/notifier.ts`, add `import { standInFor } from './customEmoji.js'` and use `standInFor(sighting.emoji)` in the two title branches of `payloadFor`:

```ts
export function payloadFor(sighting: Sighting): string {
  const glyph = standInFor(sighting.emoji)
  const title =
    sighting.name === null
      ? `${glyph} Natalie saw a critter!`
      : `${glyph} Natalie saw ${sighting.name}!`
  const body = [sighting.place, sighting.comment].filter((part) => part !== null).join(' — ')
  return JSON.stringify({ title, body, url: '/' })
}
```

Re-run both → PASS.

- [ ] **Step 6: Full verification and commit**

Run: `pnpm test && pnpm lint && pnpm typecheck && pnpm build`
Expected: all green (integration needs Docker).

```bash
git add server/emojiField.ts server/emojiField.test.ts server/sightings/routes.ts server/sightings/routes.test.ts server/profiles/routes.ts server/profiles/routes.test.ts server/feed/buildFeed.ts server/feed/buildFeed.test.ts server/push/notifier.ts server/push/notifier.test.ts
git commit -m "feat: shared emoji validation and custom-emoji stand-ins in RSS + push"
```
