import { customFor } from './customEmoji'

export type Critter = { emoji: string; name: string; tint: string }

// docs/design/README.md — "Critter tile tints" token row
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

// docs/design/README.md — §5 "Other" secondary grid, in listed order
export const EXTENDED: string[] = [
  '🐶', '🐕', '🦮', '🐕‍🦺', '🐩', '🐺', '🐱', '🐈', '🐈‍⬛', '🦁', '🐯', '🐅', '🐆', '🐴', '🐎',
  '🦄', '🦓', '🦬', '🐮', '🐂', '🐃', '🐄', '🐷', '🐖', '🐗', '🐽', '🐏', '🐑', '🐐', '🐪', '🐫',
  '🦙', '🦒', '🐘', '🦣', '🦏', '🦛', '🐁', '🐀', '🐹', '🦔', '🐻‍❄️', '🐨',
  '🐼', '🦥', '🦦', '🦘', '🦡', '🫎', '🐔', '🐓', '🐣', '🐤', '🐥', '🐧', '🕊️', '🦢', '🪿',
  '🦤', '🦩', '🦚', '🦜', '🐦‍⬛', '🐊', '🦎', '🐉', '🐲', '🦕', '🦖', '🐳', '🐋', '🐬', '🦭',
  '🐟', '🐠', '🐡', '🦈', '🐙', '🦀', '🦞', '🦐', '🦑', '🦪', '🐌', '🦋', '🐛', '🐜', '🐝', '🪲', '🐞',
  '🦗', '🪳', '🕷️', '🦂', '🦟', '🪰', '🪱',
]

export function nameFor(emoji: string): string | null {
  const custom = customFor(emoji)
  if (custom !== null) return custom.name
  return CURATED.find((c) => c.emoji === emoji)?.name ?? null
}

/** Friend identity comparisons ignore case and surrounding whitespace
 *  (mobile autocapitalize makes "Mr fox"/"Mr Fox" the same friend). */
export function normalizedName(value: string): string {
  return value.trim().toLowerCase()
}
