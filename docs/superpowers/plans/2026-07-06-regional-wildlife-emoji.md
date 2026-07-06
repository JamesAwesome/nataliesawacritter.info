# Regional Wildlife Emoji Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add notable PA/Maine wildlife emoji — up to nine hand-drawn custom SVGs (gated on art quality) plus the Unicode moose 🫎 — extending the custom-emoji system so custom emoji can live in any picker category, not just Birds.

**Architecture:** Custom emoji stay a `custom:<slug>` token backed by a static SVG + client/server catalogue. This plan generalizes them beyond birds by adding a `category` field, makes the picker's category grid data-driven off that field, and adds the approved animals. An art-approval gate (draw → render → user approves → wire up winners) decides the final set.

**Tech Stack:** React 19, Express 5, Vitest 4. No new dependencies, no DB change.

**Spec:** `docs/superpowers/specs/2026-07-06-regional-wildlife-emoji-design.md`

## Global Constraints

- Run from `app/`; raw vitest needs `NODE_OPTIONS=--no-experimental-webstorage`; server imports use `.js` extensions; no raw hex in **TSX** (SVG asset files may use hex); no new dependencies.
- Category keys are exactly: `birds`, `mammals`, `reptiles`, `sea`, `bugs` (labels: Birds, Mammals, Reptiles & Amphibians, Sea Life, Bugs).
- `CustomEmoji = { slug, name, standIn, category }`. `CategoryKey` is defined in `customEmoji.ts` (so `customEmoji.ts` imports nothing from `emojiCategories.ts`/`critters.ts` — no cycle).
- Candidate animals (slug · Name · category · stand-in): `groundhog`·Groundhog·mammals·🦫 · `porcupine`·Porcupine·mammals·🦔 · `opossum`·Opossum·mammals·🐀 · `bobcat`·Bobcat·mammals·🐱 · `loon`·Common Loon·birds·🦆 · `puffin`·Atlantic Puffin·birds·🐧 · `grouse`·Ruffed Grouse·birds·🐔 · `firefly`·Firefly·bugs·🪲 · `hellbender`·Eastern Hellbender·reptiles·🦎.
- Moose 🫎 is a Unicode add (mammals), not custom.
- The final shipped custom set = existing 7 birds + the animals that pass the art gate (Task 3). Task 4 wires up only approved slugs; its pinned lists/tests must match that exact set.

---

### Task 1: custom emoji gain a `category`; categories become data-driven

**Files:**
- Modify: `app/src/lib/customEmoji.ts`, `app/src/lib/customEmoji.test.ts`
- Modify: `app/src/lib/emojiCategories.ts`, `app/src/lib/emojiCategories.test.ts`

**Interfaces:**
- Produces: `CategoryKey = 'birds' | 'mammals' | 'reptiles' | 'sea' | 'bugs'`; `CustomEmoji` gains `category: CategoryKey`; `emojiCategories.ts` builds each category as `[…custom tokens with that category, …that category's Unicode]`.

- [ ] **Step 1: Write the failing category-placement test**

Append to `app/src/lib/emojiCategories.test.ts`:

```ts
import { CUSTOM, tokenFor } from './customEmoji'

it('places every custom token in exactly its declared category', () => {
  for (const c of CUSTOM) {
    const inCat = CATEGORIES.find((cat) => cat.key === c.category)
    expect(inCat, `category ${c.category} exists`).toBeDefined()
    expect(inCat?.items).toContain(tokenFor(c.slug))
    // and in no other category
    const others = CATEGORIES.filter((cat) => cat.key !== c.category)
    for (const o of others) expect(o.items).not.toContain(tokenFor(c.slug))
  }
})

it('every custom emoji declares a known category', () => {
  const keys = new Set(CATEGORIES.map((c) => c.key))
  for (const c of CUSTOM) expect(keys.has(c.category)).toBe(true)
})
```

- [ ] **Step 2: Run to verify failure**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client src/lib/emojiCategories.test.ts`
Expected: FAIL — `CUSTOM` entries have no `category` (type error / undefined).

- [ ] **Step 3: Add `CategoryKey` + `category` to the client catalogue**

In `app/src/lib/customEmoji.ts`, add the type and a category on each entry:

```ts
export type CategoryKey = 'birds' | 'mammals' | 'reptiles' | 'sea' | 'bugs'
export type CustomEmoji = { slug: string; name: string; standIn: string; category: CategoryKey }

export const CUSTOM: CustomEmoji[] = [
  { slug: 'robin', name: 'Robin', standIn: '🐦', category: 'birds' },
  { slug: 'cardinal', name: 'Cardinal', standIn: '🐦', category: 'birds' },
  { slug: 'blue-jay', name: 'Blue Jay', standIn: '🐦', category: 'birds' },
  { slug: 'chickadee', name: 'Chickadee', standIn: '🐦', category: 'birds' },
  { slug: 'goldfinch', name: 'Goldfinch', standIn: '🐦', category: 'birds' },
  { slug: 'sparrow', name: 'Sparrow', standIn: '🐦', category: 'birds' },
  { slug: 'seagull', name: 'Seagull', standIn: '🐦', category: 'birds' },
]
```

(Leave `CUSTOM_PREFIX`, `tokenFor`, `customFor`, `standInFor` unchanged.)

- [ ] **Step 4: Make `emojiCategories.ts` data-driven off `category`**

Replace the body of `app/src/lib/emojiCategories.ts` with:

```ts
import { CUSTOM, tokenFor, type CategoryKey } from './customEmoji'

export type EmojiCategory = { key: CategoryKey; label: string; items: string[] }

// Unicode members per category (curated + extended animals of that kind).
// Coverage against CURATED ∪ EXTENDED is enforced by emojiCategories.test.ts.
const UNICODE: Record<CategoryKey, string[]> = {
  birds: ['🐦', '🦉', '🦆', '🦃', '🦅', '🐔', '🐓', '🐣', '🐤', '🐥', '🐧', '🕊️', '🦢', '🪿', '🦤', '🦩', '🦚', '🦜', '🐦‍⬛'],
  mammals: [
    '🦌', '🐿️', '🐇', '🦝', '🦨', '🦇', '🐭', '🦊', '🐻', '🦫',
    '🐶', '🐕', '🦮', '🐕‍🦺', '🐩', '🐺', '🐱', '🐈', '🐈‍⬛', '🦁', '🐯', '🐅', '🐆',
    '🐴', '🐎', '🦄', '🦓', '🦬', '🐮', '🐂', '🐃', '🐄', '🐷', '🐖', '🐗', '🐽',
    '🐏', '🐑', '🐐', '🐪', '🐫', '🦙', '🦒', '🐘', '🦣', '🦏', '🦛',
    '🐁', '🐀', '🐹', '🦔', '🐻‍❄️', '🐨', '🐼', '🦥', '🦦', '🦘', '🦡',
  ],
  reptiles: ['🐸', '🐢', '🐍', '🐊', '🦎', '🐉', '🐲', '🦕', '🦖'],
  sea: ['🐳', '🐋', '🐬', '🦭', '🐟', '🐠', '🐡', '🦈', '🐙', '🦀', '🦞', '🦐', '🦑', '🦪'],
  bugs: ['🐌', '🦋', '🐛', '🐜', '🐝', '🪲', '🐞', '🦗', '🪳', '🕷️', '🦂', '🦟', '🪰', '🪱'],
}

const ORDER: { key: CategoryKey; label: string }[] = [
  { key: 'birds', label: 'Birds' },
  { key: 'mammals', label: 'Mammals' },
  { key: 'reptiles', label: 'Reptiles & Amphibians' },
  { key: 'sea', label: 'Sea Life' },
  { key: 'bugs', label: 'Bugs' },
]

function customTokensFor(key: CategoryKey): string[] {
  return CUSTOM.filter((c) => c.category === key).map((c) => tokenFor(c.slug))
}

export const CATEGORIES: EmojiCategory[] = ORDER.map(({ key, label }) => ({
  key,
  label,
  items: [...customTokensFor(key), ...UNICODE[key]],
}))
```

- [ ] **Step 5: Run to verify pass**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client src/lib/emojiCategories.test.ts src/lib/customEmoji.test.ts`
Expected: PASS — including the existing coverage/label tests (non-custom items still equal CURATED ∪ EXTENDED; labels unchanged; custom birds still first in Birds).

- [ ] **Step 6: Guard the client catalogue's categories**

Append to `app/src/lib/customEmoji.test.ts`:

```ts
it('every catalogue entry has one of the five category keys', () => {
  const keys = new Set(['birds', 'mammals', 'reptiles', 'sea', 'bugs'])
  for (const c of CUSTOM) expect(keys.has(c.category)).toBe(true)
})
```

- [ ] **Step 7: Full check and commit**

Run: `pnpm test && pnpm lint && pnpm typecheck && pnpm build`
Expected: all green (the picker, RSS, etc. are unaffected — Birds still renders identically).

```bash
git add src/lib/customEmoji.ts src/lib/customEmoji.test.ts src/lib/emojiCategories.ts src/lib/emojiCategories.test.ts
git commit -m "feat: give custom emoji a category; make picker categories data-driven"
```

---

### Task 2: add the moose 🫎 (Unicode)

**Files:**
- Modify: `app/src/lib/critters.ts`, `app/src/lib/emojiCategories.ts`, `app/src/lib/emojiCategories.test.ts`

**Interfaces:**
- Consumes: the `UNICODE` map from Task 1.
- Produces: `🫎` present in `EXTENDED` and in the Mammals category.

- [ ] **Step 1: Write the failing test**

Append to `app/src/lib/emojiCategories.test.ts`:

```ts
it('includes the moose in the Mammals category', () => {
  const mammals = CATEGORIES.find((c) => c.key === 'mammals')
  expect(mammals?.items).toContain('🫎')
})
```

- [ ] **Step 2: Run to verify failure**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client src/lib/emojiCategories.test.ts`
Expected: FAIL — 🫎 not present.

- [ ] **Step 3: Add the moose to both the catalogue and the category**

In `app/src/lib/critters.ts`, add `'🫎'` to the `EXTENDED` array (append it to the mammals run, e.g. right after `'🦡'`).

In `app/src/lib/emojiCategories.ts`, add `'🫎'` to the end of the `mammals` list in `UNICODE`.

(Both are required: the coverage test asserts categories cover `CURATED ∪ EXTENDED` exactly, so adding to only one side fails.)

- [ ] **Step 4: Run to verify pass**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client src/lib/emojiCategories.test.ts`
Expected: PASS (the new test and the existing coverage test).

- [ ] **Step 5: Full check and commit**

Run: `pnpm lint && pnpm typecheck && pnpm build`
Expected: green.

```bash
git add src/lib/critters.ts src/lib/emojiCategories.ts src/lib/emojiCategories.test.ts
git commit -m "feat: add the moose to the picker (Maine)"
```

---

### Task 3: draw the nine candidate SVGs (art gate)

**Files:**
- Create: `app/public/custom-emoji/{groundhog,porcupine,opossum,bobcat,loon,puffin,grouse,firefly,hellbender}.svg`

**Interfaces:**
- Produces: candidate SVG assets at `/custom-emoji/<slug>.svg`. These are NOT yet referenced by any catalogue or test (Task 4 wires up the approved ones), so the suite stays green regardless of which survive the gate.

Transcribe each file exactly. Shared flat style: viewBox `0 0 64 64`, transparent background, so each sits like an emoji. **After creating them, the controller renders a labeled contact sheet (light + dark, 24px and larger) and the user approves the keepers; cut candidates' files are deleted before commit.**

- [ ] **Step 1: Create `groundhog.svg`** (upright brown marmot, buck teeth — Punxsutawney pose)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="Groundhog">
  <path d="M20 40 q-4 4 -1 9" stroke="#7a5c3a" stroke-width="5" fill="none" stroke-linecap="round"/>
  <path d="M44 40 q4 4 1 9" stroke="#7a5c3a" stroke-width="5" fill="none" stroke-linecap="round"/>
  <ellipse cx="32" cy="40" rx="14" ry="18" fill="#8a6a44"/>
  <ellipse cx="32" cy="44" rx="9" ry="12" fill="#b89b74"/>
  <circle cx="32" cy="18" r="11" fill="#8a6a44"/>
  <circle cx="25" cy="10" r="3" fill="#7a5c3a"/>
  <circle cx="39" cy="10" r="3" fill="#7a5c3a"/>
  <ellipse cx="32" cy="21" rx="4" ry="3" fill="#c9b090"/>
  <circle cx="32" cy="18.5" r="1.6" fill="#2a2320"/>
  <rect x="30.6" y="22" width="2.8" height="3" rx="0.6" fill="#f4f1ea"/>
  <circle cx="27" cy="15" r="1.6" fill="#2a2320"/>
  <circle cx="37" cy="15" r="1.6" fill="#2a2320"/>
  <path d="M27 57 v3 M37 57 v3" stroke="#7a5c3a" stroke-width="4" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 2: Create `porcupine.svg`** (quill-covered)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="Porcupine">
  <g fill="#4a3a28">
    <path d="M14 34 L6 20 L20 30 Z"/><path d="M20 30 L16 14 L28 28 Z"/><path d="M28 28 L28 12 L38 27 Z"/>
    <path d="M38 27 L46 13 L46 30 Z"/><path d="M12 40 L2 34 L16 40 Z"/>
  </g>
  <g fill="#8a7255">
    <path d="M17 32 L11 18 L24 29 Z"/><path d="M24 29 L22 14 L33 28 Z"/><path d="M33 28 L42 15 L43 29 Z"/>
  </g>
  <ellipse cx="30" cy="42" rx="18" ry="10" fill="#5a4a34"/>
  <circle cx="46" cy="42" r="8" fill="#6f5a40"/>
  <path d="M53 42 L59 43 L53 46 Z" fill="#2a2320"/>
  <circle cx="48" cy="40" r="1.5" fill="#2a2320"/>
  <path d="M28 51 v5 M38 51 v5" stroke="#4a3a28" stroke-width="2.5" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 3: Create `opossum.svg`** (gray body, white pointy face, pink nose/ears/tail)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="Opossum">
  <path d="M14 42 q-12 0 -12 8 q0 5 6 5 q6 0 6 -8 Z" fill="#e6c2c2"/>
  <ellipse cx="30" cy="40" rx="17" ry="11" fill="#9a938b"/>
  <circle cx="47" cy="34" r="10" fill="#f4f1ea"/>
  <path d="M55 33 L63 35 L55 38 Z" fill="#f4f1ea"/>
  <circle cx="62" cy="35.5" r="2" fill="#e0888f"/>
  <circle cx="41" cy="27" r="3.5" fill="#e6c2c2"/>
  <circle cx="50" cy="26" r="3.5" fill="#e6c2c2"/>
  <circle cx="48" cy="33" r="1.6" fill="#2a2320"/>
  <path d="M26 50 v6 M36 50 v6" stroke="#e6c2c2" stroke-width="2" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 4: Create `bobcat.svg`** (tan spotted cat, ear tufts, short tail)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="Bobcat">
  <path d="M15 40 q-6 -2 -8 -8" stroke="#b98a52" stroke-width="5" fill="none" stroke-linecap="round"/>
  <ellipse cx="30" cy="40" rx="16" ry="11" fill="#c99a5c"/>
  <g fill="#7a5c38"><circle cx="24" cy="38" r="1.3"/><circle cx="31" cy="42" r="1.3"/><circle cx="37" cy="37" r="1.3"/></g>
  <circle cx="46" cy="30" r="10" fill="#c99a5c"/>
  <path d="M39 22 L37 12 L44 20 Z" fill="#c99a5c"/>
  <path d="M37 12 L38.5 9" stroke="#2a2320" stroke-width="1.5" stroke-linecap="round"/>
  <path d="M52 22 L54 12 L47 20 Z" fill="#c99a5c"/>
  <path d="M54 12 L52.5 9" stroke="#2a2320" stroke-width="1.5" stroke-linecap="round"/>
  <ellipse cx="47" cy="32" rx="4" ry="3" fill="#f4f1ea"/>
  <circle cx="47" cy="31" r="1.3" fill="#2a2320"/>
  <circle cx="43" cy="29" r="1.4" fill="#2a2320"/>
  <circle cx="51" cy="29" r="1.4" fill="#2a2320"/>
  <path d="M26 50 v6 M36 50 v6" stroke="#b98a52" stroke-width="2.5" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 5: Create `loon.svg`** (black/white waterbird, red eye, dagger bill)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="Common Loon">
  <path d="M18 40 L2 49 L16 53 Z" fill="#20201e"/>
  <ellipse cx="30" cy="38" rx="16" ry="13" fill="#2a2320"/>
  <ellipse cx="34" cy="43" rx="11" ry="8" fill="#f4f1ea"/>
  <path d="M20 30 q11 3 15 14 q-11 2 -17 -5 Z" fill="#3a332f"/>
  <g fill="#f4f1ea"><circle cx="24" cy="32" r="1.4"/><circle cx="29" cy="30" r="1.4"/><circle cx="21" cy="37" r="1.2"/></g>
  <circle cx="42" cy="24" r="11" fill="#2a2320"/>
  <path d="M52 23 L63 22 L52 27 Z" fill="#3a3530"/>
  <circle cx="45.5" cy="22" r="2" fill="#d2262a"/>
  <path d="M28 50 v6 M34 50 v6" stroke="#3a3530" stroke-width="2" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 6: Create `puffin.svg`** (black back, white face, big orange bill)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="Atlantic Puffin">
  <path d="M18 40 L2 49 L16 53 Z" fill="#20201e"/>
  <ellipse cx="30" cy="38" rx="16" ry="13" fill="#2a2320"/>
  <ellipse cx="34" cy="42" rx="11" ry="9" fill="#f4f1ea"/>
  <path d="M20 30 q11 3 15 14 q-11 2 -17 -5 Z" fill="#20201e"/>
  <circle cx="42" cy="24" r="11" fill="#2a2320"/>
  <circle cx="43" cy="25" r="7.5" fill="#f4f1ea"/>
  <path d="M50 19 q11 1 11 6 q0 5 -11 6 q-4 -6 0 -12 Z" fill="#f0932a"/>
  <path d="M55 20 q4 4 0 11" stroke="#d2555c" stroke-width="1.2" fill="none"/>
  <circle cx="45" cy="22" r="1.6" fill="#2a2320"/>
  <path d="M28 50 v6 M34 50 v6" stroke="#f0932a" stroke-width="2" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 7: Create `grouse.svg`** (plump brown bird, small crest, fan tail)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="Ruffed Grouse">
  <path d="M14 38 L2 31 L4 40 L2 50 L15 46 Z" fill="#7a5f3f"/>
  <ellipse cx="32" cy="38" rx="17" ry="14" fill="#9c7a52"/>
  <ellipse cx="36" cy="43" rx="11" ry="9" fill="#c9b088"/>
  <path d="M24 30 q12 3 16 15 q-12 2 -18 -5 Z" fill="#7a5f3f"/>
  <path d="M41 22 q5 -5 9 -2" stroke="#6f5636" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <circle cx="44" cy="25" r="10" fill="#9c7a52"/>
  <path d="M53 24 L60 26 L53 28 Z" fill="#6b5537"/>
  <circle cx="47" cy="23" r="1.6" fill="#2a2320"/>
  <path d="M30 51 v5 M36 51 v5" stroke="#8a6a44" stroke-width="2" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 8: Create `firefly.svg`** (dark beetle, glowing abdomen)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="Firefly">
  <ellipse cx="30" cy="46" rx="13" ry="15" fill="#d8e84a" opacity="0.25"/>
  <path d="M27 17 q-4 -6 -9 -5 M33 17 q4 -6 9 -5" stroke="#2a2a22" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  <circle cx="30" cy="22" r="6" fill="#2a2a22"/>
  <path d="M24 30 q-9 4 -6 15 M36 30 q9 4 6 15" stroke="#6a6a4a" stroke-width="2" fill="none" stroke-linecap="round"/>
  <ellipse cx="30" cy="34" rx="7" ry="10" fill="#3a3a2e"/>
  <ellipse cx="30" cy="47" rx="8.5" ry="10" fill="#d8e84a"/>
  <ellipse cx="30" cy="49" rx="5" ry="6" fill="#f2f7b0"/>
  <circle cx="27.6" cy="21" r="1.3" fill="#c8d84a"/>
  <circle cx="32.4" cy="21" r="1.3" fill="#c8d84a"/>
</svg>
```

- [ ] **Step 9: Create `hellbender.svg`** (flat giant salamander)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="Eastern Hellbender">
  <path d="M8 40 q-4 -3 -3 -7 M8 46 q-5 2 -4 7" stroke="#6f6a44" stroke-width="3" fill="none" stroke-linecap="round"/>
  <ellipse cx="34" cy="40" rx="24" ry="9" fill="#6f6a44"/>
  <path d="M20 33 q-3 -4 -7 -3 M20 47 q-3 4 -7 3 M44 33 q3 -4 7 -3 M44 47 q3 4 7 3" stroke="#5a5638" stroke-width="4" fill="none" stroke-linecap="round"/>
  <path d="M50 33 q9 -1 9 7 q0 8 -9 7 q-6 -7 0 -14 Z" fill="#7a744c"/>
  <path d="M52 34 q4 0 5 -1 M52 46 q4 0 5 1" stroke="#5a5638" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  <circle cx="53" cy="36" r="1.2" fill="#2a2320"/>
  <circle cx="53" cy="44" r="1.2" fill="#2a2320"/>
  <g fill="#5a5638"><circle cx="28" cy="38" r="1"/><circle cx="36" cy="42" r="1"/><circle cx="22" cy="41" r="1"/></g>
</svg>
```

- [ ] **Step 10: Verify files, then hand off to the art gate**

Run (from `app/`): `ls public/custom-emoji/`
Expected: the 9 new `.svg` files present (plus the 7 birds).

**Do not commit yet.** The controller renders all nine at real size (light + dark) and the user approves the keepers. Delete any cut candidate's `.svg`, then commit only the survivors:

```bash
git add public/custom-emoji/
git commit -m "feat: add regional wildlife emoji SVGs (approved set)"
```

Record the approved slug list in the task report — Task 4 depends on it.

---

### Task 4: wire up the approved animals

**Files:**
- Modify: `app/src/lib/customEmoji.ts`, `app/src/lib/customEmoji.test.ts`
- Modify: `app/server/customEmoji.ts`, `app/server/customEmoji.test.ts`

**Interfaces:**
- Consumes: the approved SVGs (Task 3) and the `category` mechanism (Task 1).
- Produces: approved animals as full custom emoji — pickable, validated, stand-in on RSS/push. Category placement is automatic (Task 1's data-driven build).

> **The approved set** from Task 3 determines exactly which entries to add. Add an entry for EACH approved slug and NONE of the cut ones. The per-animal data is in Global Constraints. Below shows all nine; include only the approved subset, consistently, in every list.

- [ ] **Step 1: Update the client-catalogue drift test to the new pinned set**

In `app/src/lib/customEmoji.test.ts`, extend the pinned slug-list assertion to `['robin','cardinal','blue-jay','chickadee','goldfinch','sparrow','seagull', …approved new slugs]` (exact order you add them in `CUSTOM`). The on-disk-SVG check and the category-key check already cover the new files/fields.

- [ ] **Step 2: Run to verify failure**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client src/lib/customEmoji.test.ts`
Expected: FAIL — `CUSTOM` doesn't yet contain the new slugs.

- [ ] **Step 3: Add the approved entries to the client catalogue**

In `app/src/lib/customEmoji.ts`, append the approved entries to `CUSTOM` (this example lists all nine — include only approved ones):

```ts
  { slug: 'groundhog', name: 'Groundhog', standIn: '🦫', category: 'mammals' },
  { slug: 'porcupine', name: 'Porcupine', standIn: '🦔', category: 'mammals' },
  { slug: 'opossum', name: 'Opossum', standIn: '🐀', category: 'mammals' },
  { slug: 'bobcat', name: 'Bobcat', standIn: '🐱', category: 'mammals' },
  { slug: 'loon', name: 'Common Loon', standIn: '🦆', category: 'birds' },
  { slug: 'puffin', name: 'Atlantic Puffin', standIn: '🐧', category: 'birds' },
  { slug: 'grouse', name: 'Ruffed Grouse', standIn: '🐔', category: 'birds' },
  { slug: 'firefly', name: 'Firefly', standIn: '🪲', category: 'bugs' },
  { slug: 'hellbender', name: 'Eastern Hellbender', standIn: '🦎', category: 'reptiles' },
```

- [ ] **Step 4: Run to verify pass**

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project client src/lib/customEmoji.test.ts src/lib/emojiCategories.test.ts`
Expected: PASS — the pinned list matches; every new token lands in its category (mammals/birds/bugs/reptiles); on-disk SVGs found.

- [ ] **Step 5: Add the approved slugs to the server catalogue (TDD)**

In `app/server/customEmoji.test.ts`, extend the pinned slug-list assertion to the same set (sorted). Run it → FAIL. Then in `app/server/customEmoji.ts`, add each approved slug → stand-in to `STAND_INS` (matching the client stand-ins above):

```ts
  groundhog: '🦫',
  porcupine: '🦔',
  opossum: '🐀',
  bobcat: '🐱',
  loon: '🦆',
  puffin: '🐧',
  grouse: '🐔',
  firefly: '🪲',
  hellbender: '🦎',
```

Re-run: `NODE_OPTIONS=--no-experimental-webstorage pnpm vitest run --project unit server/customEmoji.test.ts` → PASS (`KNOWN_SLUGS` now matches; `isKnownCustom`/`standInFor` resolve the new slugs; on-disk SVG check passes).

- [ ] **Step 6: Full verification (incl. visual gate) and commit**

Run: `pnpm test && pnpm lint && pnpm typecheck && pnpm build`
Expected: all green.

**Visual gate:** run the app and confirm each approved animal appears in the correct "Other" category (groundhog/porcupine/opossum/bobcat under Mammals, loon/puffin/grouse under Birds — custom-first, firefly under Bugs, hellbender under Reptiles & Amphibians), renders at the right size, and that logging one stores `custom:<slug>`, tracks in Top Critters with its picture, and shows the stand-in on RSS/push. Also confirm 🫎 appears under Mammals.

```bash
git add src/lib/customEmoji.ts src/lib/customEmoji.test.ts server/customEmoji.ts server/customEmoji.test.ts
git commit -m "feat: ship approved regional wildlife custom emoji"
```
