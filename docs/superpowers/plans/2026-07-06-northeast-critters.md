# Northeast Critter Curation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recurate the log-sighting picker's fast tiles to 18 American-Northeast animals so Natalie rarely needs "Other". Per `docs/superpowers/specs/2026-07-06-northeast-critters-design.md`.

**Architecture:** A pure data change in `app/src/lib/critters.ts`: replace the 12-entry `CURATED` with 18 NE animals, and remove the 8 newly-promoted animals from `EXTENDED` while adding the 2 demoted ones (Hedgehog, Butterfly) — keeping the two sets disjoint so nothing renders twice and nothing disappears. `nameFor` is unchanged (it derives from `CURATED`). Tests in `critters.test.ts` are updated to the new sets.

**Tech Stack:** TypeScript, Vitest 4. **No new dependencies. Single source file + its test.**

**Spec:** `docs/superpowers/specs/2026-07-06-northeast-critters-design.md`

## Global Constraints

- pnpm from `app/`; raw vitest needs `NODE_OPTIONS=--no-experimental-webstorage` prefix.
- `CURATED` and `EXTENDED` must share NO emoji (already an asserted invariant in `critters.test.ts`).
- No CSS/layout change; no change to `EmojiPicker.tsx`, `nameFor`, or `normalizedName`.
- Every animal cut from the old curated set (Hedgehog 🦔, Butterfly 🦋) must remain reachable — i.e. present in `EXTENDED`.

---

### Task 1: Recurate CURATED to 18 and rebalance EXTENDED

**Files:**
- Modify: `app/src/lib/critters.ts` (the `CURATED` and `EXTENDED` arrays only)
- Test: `app/src/lib/critters.test.ts`

**Interfaces:**
- Produces: `CURATED` (18 entries, exact names/order below); `EXTENDED` (95 emoji, disjoint from CURATED). `nameFor`/`normalizedName` signatures unchanged.

- [ ] **Step 1: Update the tests to the new expected sets (RED)**

In `app/src/lib/critters.test.ts`, replace the curated-names assertion (currently the 12-name array) with the 18-name set:

```ts
  it('has the 18 curated critters in design order', () => {
    expect(CURATED.map((c) => c.name)).toEqual([
      'Deer', 'Squirrel', 'Rabbit', 'Bird', 'Raccoon', 'Skunk',
      'Owl', 'Duck', 'Frog', 'Turtle', 'Bat', 'Mouse',
      'Snake', 'Fox', 'Turkey', 'Bear', 'Eagle', 'Beaver',
    ])
    for (const c of CURATED) {
      expect(c.emoji.length).toBeGreaterThan(0)
      expect(c.tint).toMatch(/^var\(--tint-/)
    }
  })
```

In the "extended animal set" test, relax the length floor (the set drops from 101 to 95 after moving 8 out and 2 in) — change `toBeGreaterThanOrEqual(100)` to `toBeGreaterThanOrEqual(90)`. Leave the disjoint check, the no-duplicates check, and the `toContain('🐱'|'🐶'|'🦁')` assertions unchanged (those three stay in EXTENDED). Add two assertions that the demoted animals landed in EXTENDED:

```ts
    expect(EXTENDED).toContain('🦔')
    expect(EXTENDED).toContain('🦋')
```

In the `nameFor` describe block, extend the coverage to the new tiles and a removed one:

```ts
  it('returns the curated name for a curated emoji, null otherwise', () => {
    expect(nameFor('🦊')).toBe('Fox')
    expect(nameFor('🦨')).toBe('Skunk')
    expect(nameFor('🐻')).toBe('Bear')
    expect(nameFor('🐙')).toBeNull()
    expect(nameFor('🦔')).toBeNull() // demoted out of CURATED
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `app/`): `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client src/lib/critters.test.ts`
Expected: FAIL — curated names are still the old 12; `nameFor('🦨')` is null; `EXTENDED` doesn't contain 🦔/🦋. (The disjoint check still passes at this point because CURATED hasn't changed yet.)

- [ ] **Step 3: Replace CURATED with the 18 NE animals**

In `app/src/lib/critters.ts`, replace the entire `CURATED` array with:

```ts
export const CURATED: Critter[] = [
  { emoji: '🦌', name: 'Deer', tint: 'var(--tint-pink)' },
  { emoji: '🐿️', name: 'Squirrel', tint: 'var(--tint-peach)' },
  { emoji: '🐇', name: 'Rabbit', tint: 'var(--tint-yellow)' },
  { emoji: '🐦', name: 'Bird', tint: 'var(--tint-mint)' },
  { emoji: '🦝', name: 'Raccoon', tint: 'var(--tint-aqua)' },
  { emoji: '🦨', name: 'Skunk', tint: 'var(--tint-sky)' },
  { emoji: '🦉', name: 'Owl', tint: 'var(--tint-lavender)' },
  { emoji: '🦆', name: 'Duck', tint: 'var(--tint-orchid)' },
  { emoji: '🐸', name: 'Frog', tint: 'var(--tint-pink)' },
  { emoji: '🐢', name: 'Turtle', tint: 'var(--tint-peach)' },
  { emoji: '🦇', name: 'Bat', tint: 'var(--tint-yellow)' },
  { emoji: '🐭', name: 'Mouse', tint: 'var(--tint-mint)' },
  { emoji: '🐍', name: 'Snake', tint: 'var(--tint-aqua)' },
  { emoji: '🦊', name: 'Fox', tint: 'var(--tint-sky)' },
  { emoji: '🦃', name: 'Turkey', tint: 'var(--tint-lavender)' },
  { emoji: '🐻', name: 'Bear', tint: 'var(--tint-orchid)' },
  { emoji: '🦅', name: 'Eagle', tint: 'var(--tint-pink)' },
  { emoji: '🦫', name: 'Beaver', tint: 'var(--tint-peach)' },
]
```

- [ ] **Step 4: Rebalance EXTENDED (remove the 8 promoted, add the 2 demoted)**

Still in `app/src/lib/critters.ts`, replace the entire `EXTENDED` array with the following. This removes 🦨 🦇 🐭 🐍 🦃 🐻 🦅 🦫 (now curated) and adds 🦔 (among the small mammals) and 🦋 (among the insects); the polar bear 🐻‍❄️ is a distinct glyph and stays:

```ts
export const EXTENDED: string[] = [
  '🐶', '🐕', '🦮', '🐕‍🦺', '🐩', '🐺', '🐱', '🐈', '🐈‍⬛', '🦁', '🐯', '🐅', '🐆', '🐴', '🐎',
  '🦄', '🦓', '🦬', '🐮', '🐂', '🐃', '🐄', '🐷', '🐖', '🐗', '🐽', '🐏', '🐑', '🐐', '🐪', '🐫',
  '🦙', '🦒', '🐘', '🦣', '🦏', '🦛', '🐁', '🐀', '🐹', '🦔', '🐻‍❄️', '🐨',
  '🐼', '🦥', '🦦', '🦘', '🦡', '🐔', '🐓', '🐣', '🐤', '🐥', '🐧', '🕊️', '🦢',
  '🦤', '🦩', '🦚', '🦜', '🐦‍⬛', '🐊', '🦎', '🐉', '🐲', '🦕', '🦖', '🐳', '🐋', '🐬', '🦭',
  '🐟', '🐠', '🐡', '🦈', '🐙', '🦀', '🦞', '🦐', '🦑', '🦪', '🐌', '🦋', '🐛', '🐜', '🐝', '🪲', '🐞',
  '🦗', '🪳', '🕷️', '🦂', '🦟', '🪰', '🪱',
]
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client src/lib/critters.test.ts`
Expected: PASS — 18 curated names in order; `nameFor` spot-checks resolve; EXTENDED contains 🦔/🦋, is disjoint from CURATED, has no duplicates, and length (95) clears the ≥90 floor.

- [ ] **Step 6: Run the full suite, lint, typecheck, build**

Run: `pnpm test && pnpm lint && pnpm typecheck && pnpm build`
Expected: all green. The EmojiPicker/App/flow tests reference only surviving tiles (Deer, Fox, Owl) and the "Other" button, so they keep passing; integration tests need Docker.

- [ ] **Step 7: Commit**

```bash
git add src/lib/critters.ts src/lib/critters.test.ts
git commit -m "feat: curate the picker to 18 Northeast-native critters"
```
