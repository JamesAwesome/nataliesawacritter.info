import { customFor } from './customEmoji'
import { emojiKey } from './emojiKey'

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
  '🐼', '🦥', '🦦', '🦘', '🦡', '🫎', '🦍', '🦧', '🐒', '🐔', '🐓', '🐣', '🐤', '🐥', '🐧', '🕊️', '🦢', '🪿',
  '🦤', '🦩', '🦚', '🦜', '🐦‍⬛', '🐊', '🦎', '🐉', '🐲', '🦕', '🦖', '🐳', '🐋', '🐬', '🦭',
  '🐟', '🐠', '🐡', '🦈', '🐙', '🦀', '🦞', '🦐', '🦑', '🦪', '🐌', '🦋', '🐛', '🐜', '🐝', '🪲', '🐞',
  '🦗', '🪳', '🕷️', '🦂', '🦟', '🪰', '🪱',
]

// Names for the EXTENDED unicode critters so the picker filter can match them by
// name (and so their tiles get real accessibility labels). Coverage over EXTENDED
// is enforced by critters.test.ts. Names lean toward the common search term.
export const EMOJI_NAMES: Record<string, string> = {
  '🐶': 'Dog', '🐕': 'Dog', '🦮': 'Guide dog', '🐕‍🦺': 'Service dog', '🐩': 'Poodle', '🐺': 'Wolf',
  '🐱': 'Cat', '🐈': 'Cat', '🐈‍⬛': 'Black cat', '🦁': 'Lion', '🐯': 'Tiger', '🐅': 'Tiger', '🐆': 'Leopard',
  '🐴': 'Horse', '🐎': 'Horse', '🦄': 'Unicorn', '🦓': 'Zebra', '🦬': 'Bison',
  '🐮': 'Cow', '🐂': 'Ox', '🐃': 'Water buffalo', '🐄': 'Cow', '🐷': 'Pig', '🐖': 'Pig', '🐗': 'Boar', '🐽': 'Pig nose',
  '🐏': 'Ram', '🐑': 'Sheep', '🐐': 'Goat', '🐪': 'Camel', '🐫': 'Two-hump camel', '🦙': 'Llama', '🦒': 'Giraffe',
  '🐘': 'Elephant', '🦣': 'Mammoth', '🦏': 'Rhino', '🦛': 'Hippo',
  '🐁': 'Mouse', '🐀': 'Rat', '🐹': 'Hamster', '🦔': 'Hedgehog', '🐻‍❄️': 'Polar bear', '🐨': 'Koala',
  '🐼': 'Panda', '🦥': 'Sloth', '🦦': 'Otter', '🦘': 'Kangaroo', '🦡': 'Badger', '🫎': 'Moose',
  '🦍': 'Gorilla', '🦧': 'Orangutan', '🐒': 'Monkey',
  '🐔': 'Chicken', '🐓': 'Rooster', '🐣': 'Hatching chick', '🐤': 'Baby chick', '🐥': 'Chick', '🐧': 'Penguin',
  '🕊️': 'Dove', '🦢': 'Swan', '🪿': 'Goose', '🦤': 'Dodo', '🦩': 'Flamingo', '🦚': 'Peacock', '🦜': 'Parrot', '🐦‍⬛': 'Blackbird',
  '🐊': 'Crocodile', '🦎': 'Lizard', '🐉': 'Dragon', '🐲': 'Dragon', '🦕': 'Dinosaur', '🦖': 'T-Rex',
  '🐳': 'Whale', '🐋': 'Whale', '🐬': 'Dolphin', '🦭': 'Seal',
  '🐟': 'Fish', '🐠': 'Tropical fish', '🐡': 'Pufferfish', '🦈': 'Shark', '🐙': 'Octopus', '🦀': 'Crab',
  '🦞': 'Lobster', '🦐': 'Shrimp', '🦑': 'Squid', '🦪': 'Oyster',
  '🐌': 'Snail', '🦋': 'Butterfly', '🐛': 'Caterpillar', '🐜': 'Ant', '🐝': 'Bee', '🪲': 'Beetle', '🐞': 'Ladybug',
  '🦗': 'Cricket', '🪳': 'Cockroach', '🕷️': 'Spider', '🦂': 'Scorpion', '🦟': 'Mosquito', '🪰': 'Fly', '🪱': 'Worm',
}

const EXTENDED_NAMES = new Map(
  Object.entries(EMOJI_NAMES).map(([emoji, name]) => [emojiKey(emoji), name]),
)

export function nameFor(emoji: string): string | null {
  const custom = customFor(emoji)
  if (custom !== null) return custom.name
  // Keyed without the variation selector, so '🐿' names the same critter as '🐿️'.
  const key = emojiKey(emoji)
  return CURATED.find((c) => emojiKey(c.emoji) === key)?.name ?? EXTENDED_NAMES.get(key) ?? null
}

/** Friend identity comparisons ignore case and surrounding whitespace
 *  (mobile autocapitalize makes "Mr fox"/"Mr Fox" the same friend). */
export function normalizedName(value: string): string {
  return value.trim().toLowerCase()
}
