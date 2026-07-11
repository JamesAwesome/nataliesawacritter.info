export type CategoryKey = 'birds' | 'mammals' | 'reptiles' | 'sea' | 'bugs'
export type CustomEmoji = { slug: string; name: string; standIn: string; category: CategoryKey }

export const CUSTOM_PREFIX = 'custom:'

export const CUSTOM: CustomEmoji[] = [
  { slug: 'robin', name: 'Robin', standIn: '🐦', category: 'birds' },
  { slug: 'cardinal', name: 'Cardinal', standIn: '🐦', category: 'birds' },
  { slug: 'blue-jay', name: 'Blue Jay', standIn: '🐦', category: 'birds' },
  { slug: 'chickadee', name: 'Chickadee', standIn: '🐦', category: 'birds' },
  { slug: 'goldfinch', name: 'Goldfinch', standIn: '🐦', category: 'birds' },
  { slug: 'sparrow', name: 'Sparrow', standIn: '🐦', category: 'birds' },
  { slug: 'seagull', name: 'Seagull', standIn: '🐦', category: 'birds' },
  { slug: 'groundhog', name: 'Groundhog', standIn: '🦫', category: 'mammals' },
  { slug: 'opossum', name: 'Opossum', standIn: '🐀', category: 'mammals' },
  { slug: 'bobcat', name: 'Bobcat', standIn: '🐱', category: 'mammals' },
  { slug: 'loon', name: 'Common Loon', standIn: '🦆', category: 'birds' },
  { slug: 'puffin', name: 'Atlantic Puffin', standIn: '🐧', category: 'birds' },
  { slug: 'grouse', name: 'Ruffed Grouse', standIn: '🐔', category: 'birds' },
  { slug: 'firefly', name: 'Firefly', standIn: '🪲', category: 'bugs' },
  { slug: 'gritty', name: 'Gritty', standIn: '🧡', category: 'mammals' },
  { slug: 'phanatic', name: 'Phillie Phanatic', standIn: '💚', category: 'birds' },
  { slug: 'anteater', name: 'Anteater', standIn: '🦥', category: 'mammals' },
  { slug: 'red-panda', name: 'Red Panda', standIn: '🐼', category: 'mammals' },
  { slug: 'meerkat', name: 'Meerkat', standIn: '🐿️', category: 'mammals' },
  { slug: 'lemur', name: 'Lemur', standIn: '🐒', category: 'mammals' },
  { slug: 'aardvark', name: 'Aardvark', standIn: '🐷', category: 'mammals' },
  { slug: 'crane', name: 'Crane', standIn: '🦢', category: 'birds' },
  { slug: 'canada-goose', name: 'Canada Goose', standIn: '🪿', category: 'birds' },
  { slug: 'pigeon', name: 'Pigeon', standIn: '🐦', category: 'birds' },
  { slug: 'highland-cow', name: 'Highland Cow', standIn: '🐄', category: 'mammals' },
  { slug: 'capybara', name: 'Capybara', standIn: '🦫', category: 'mammals' },
  { slug: 'monarch-butterfly', name: 'Monarch Butterfly', standIn: '🦋', category: 'bugs' },
  { slug: 'pelican', name: 'Pelican', standIn: '🦢', category: 'birds' },
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
