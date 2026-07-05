export type Critter = { emoji: string; name: string; tint: string }

// docs/design/README.md — "Critter tile tints" token row
export const CURATED: Critter[] = [
  { emoji: '🦌', name: 'Deer', tint: 'var(--tint-pink)' },
  { emoji: '🐿️', name: 'Squirrel', tint: 'var(--tint-peach)' },
  { emoji: '🐦', name: 'Bird', tint: 'var(--tint-yellow)' },
  { emoji: '🐇', name: 'Rabbit', tint: 'var(--tint-mint)' },
  { emoji: '🦋', name: 'Butterfly', tint: 'var(--tint-aqua)' },
  { emoji: '🐢', name: 'Turtle', tint: 'var(--tint-sky)' },
  { emoji: '🦉', name: 'Owl', tint: 'var(--tint-lavender)' },
  { emoji: '🦊', name: 'Fox', tint: 'var(--tint-orchid)' },
  { emoji: '🦝', name: 'Raccoon', tint: 'var(--tint-pink)' },
  { emoji: '🦔', name: 'Hedgehog', tint: 'var(--tint-peach)' },
  { emoji: '🐸', name: 'Frog', tint: 'var(--tint-mint)' },
  { emoji: '🦆', name: 'Duck', tint: 'var(--tint-sky)' },
]

// docs/design/README.md — §5 "Other" secondary grid, in listed order
export const EXTENDED: string[] = [
  '🐶', '🐕', '🦮', '🐕‍🦺', '🐩', '🐺', '🐱', '🐈', '🐈‍⬛', '🦁', '🐯', '🐅', '🐆', '🐴', '🐎',
  '🦄', '🦓', '🦬', '🐮', '🐂', '🐃', '🐄', '🐷', '🐖', '🐗', '🐽', '🐏', '🐑', '🐐', '🐪', '🐫',
  '🦙', '🦒', '🐘', '🦣', '🦏', '🦛', '🐭', '🐁', '🐀', '🐹', '🦫', '🦇', '🐻', '🐻‍❄️', '🐨',
  '🐼', '🦥', '🦦', '🦨', '🦘', '🦡', '🦃', '🐔', '🐓', '🐣', '🐤', '🐥', '🐧', '🕊️', '🦅', '🦢',
  '🦤', '🦩', '🦚', '🦜', '🐦‍⬛', '🐊', '🦎', '🐍', '🐉', '🐲', '🦕', '🦖', '🐳', '🐋', '🐬', '🦭',
  '🐟', '🐠', '🐡', '🦈', '🐙', '🦀', '🦞', '🦐', '🦑', '🦪', '🐌', '🐛', '🐜', '🐝', '🪲', '🐞',
  '🦗', '🪳', '🕷️', '🦂', '🦟', '🪰', '🪱',
]

export function nameFor(emoji: string): string | null {
  return CURATED.find((c) => c.emoji === emoji)?.name ?? null
}

/** Friend identity comparisons ignore case and surrounding whitespace
 *  (mobile autocapitalize makes "Mr fox"/"Mr Fox" the same friend). */
export function normalizedName(value: string): string {
  return value.trim().toLowerCase()
}
