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
