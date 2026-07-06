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
