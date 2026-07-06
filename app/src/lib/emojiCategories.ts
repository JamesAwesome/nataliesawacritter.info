import { CUSTOM, tokenFor } from './customEmoji'

export type EmojiCategory = { key: string; label: string; items: string[] }

// The "Other" grid, grouped so each category holds every emoji of its kind —
// custom birds + curated animals + the rest. Curated animals also stay in the
// top quick-pick grid; here they make each category complete. Coverage against
// CURATED + EXTENDED is enforced by emojiCategories.test.ts.
export const CATEGORIES: EmojiCategory[] = [
  {
    key: 'birds',
    label: 'Birds',
    items: [
      ...CUSTOM.map((c) => tokenFor(c.slug)),
      '🐦', '🦉', '🦆', '🦃', '🦅',
      '🐔', '🐓', '🐣', '🐤', '🐥', '🐧', '🕊️', '🦢', '🪿', '🦤', '🦩', '🦚', '🦜', '🐦‍⬛',
    ],
  },
  {
    key: 'mammals',
    label: 'Mammals',
    items: [
      '🦌', '🐿️', '🐇', '🦝', '🦨', '🦇', '🐭', '🦊', '🐻', '🦫',
      '🐶', '🐕', '🦮', '🐕‍🦺', '🐩', '🐺', '🐱', '🐈', '🐈‍⬛', '🦁', '🐯', '🐅', '🐆',
      '🐴', '🐎', '🦄', '🦓', '🦬', '🐮', '🐂', '🐃', '🐄', '🐷', '🐖', '🐗', '🐽',
      '🐏', '🐑', '🐐', '🐪', '🐫', '🦙', '🦒', '🐘', '🦣', '🦏', '🦛',
      '🐁', '🐀', '🐹', '🦔', '🐻‍❄️', '🐨', '🐼', '🦥', '🦦', '🦘', '🦡',
    ],
  },
  {
    key: 'reptiles',
    label: 'Reptiles & Amphibians',
    items: ['🐸', '🐢', '🐍', '🐊', '🦎', '🐉', '🐲', '🦕', '🦖'],
  },
  {
    key: 'sea',
    label: 'Sea Life',
    items: ['🐳', '🐋', '🐬', '🦭', '🐟', '🐠', '🐡', '🦈', '🐙', '🦀', '🦞', '🦐', '🦑', '🦪'],
  },
  {
    key: 'bugs',
    label: 'Bugs',
    items: ['🐌', '🦋', '🐛', '🐜', '🐝', '🪲', '🐞', '🦗', '🪳', '🕷️', '🦂', '🦟', '🪰', '🪱'],
  },
]
