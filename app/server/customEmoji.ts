const CUSTOM_PREFIX = 'custom:'

/** slug → Unicode stand-in for text-only surfaces (RSS titles, push). */
const STAND_INS: Record<string, string> = {
  robin: '🐦',
  cardinal: '🐦',
  'blue-jay': '🐦',
  chickadee: '🐦',
  goldfinch: '🐦',
  sparrow: '🐦',
  seagull: '🐦',
  groundhog: '🦫',
  opossum: '🐀',
  bobcat: '🐱',
  loon: '🦆',
  puffin: '🐧',
  grouse: '🐔',
  firefly: '🪲',
  gritty: '🧡',
  phanatic: '💚',
  anteater: '🦥',
  'red-panda': '🐼',
  meerkat: '🐿️',
  lemur: '🐒',
  aardvark: '🐷',
  crane: '🦢',
  'canada-goose': '🪿',
  pigeon: '🐦',
  'highland-cow': '🐄',
  capybara: '🦫',
  'monarch-butterfly': '🦋',
  pelican: '🦆',
  'horseshoe-crab': '🦀',
  stingray: '🐠',
  axolotl: '🦎',
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
