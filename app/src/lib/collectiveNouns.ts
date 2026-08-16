import { emojiKey } from './emojiKey'

/** Collective nouns for the shipped critters: a "many" sighting of crows is a
 *  murder, of rabbits a fluffle. Keyed by the stored emoji token — a Unicode
 *  emoji or a `custom:<slug>` — with `[noun, plural]` so the phrase reads
 *  "a murder of crows". Critters with no collective noun are simply absent and
 *  fall back to "Many" at the edge.
 *
 *  MIRRORED in server/collectiveNouns.ts (client and server can't share
 *  modules); collectiveNouns.test.ts fails if the two tables drift apart. */
export const COLLECTIVE_NOUNS: Record<string, readonly [noun: string, plural: string]> = {
  // Curated critters
  '🦌': ['herd', 'deer'],
  '🐿️': ['scurry', 'squirrels'],
  '🐇': ['fluffle', 'rabbits'],
  '🐦': ['flock', 'birds'],
  '🦝': ['gaze', 'raccoons'],
  '🦨': ['surfeit', 'skunks'],
  '🦉': ['parliament', 'owls'],
  '🦆': ['paddling', 'ducks'],
  '🐸': ['army', 'frogs'],
  '🐢': ['bale', 'turtles'],
  '🦇': ['cauldron', 'bats'],
  '🐭': ['mischief', 'mice'],
  '🐍': ['nest', 'snakes'],
  '🦊': ['skulk', 'foxes'],
  '🦃': ['rafter', 'turkeys'],
  '🐻': ['sleuth', 'bears'],
  '🦅': ['convocation', 'eagles'],
  '🦫': ['colony', 'beavers'],

  // Mammals
  '🐶': ['pack', 'dogs'],
  '🐕': ['pack', 'dogs'],
  '🦮': ['pack', 'dogs'],
  '🐕‍🦺': ['pack', 'dogs'],
  '🐩': ['pack', 'poodles'],
  '🐺': ['pack', 'wolves'],
  '🐱': ['clowder', 'cats'],
  '🐈': ['clowder', 'cats'],
  '🐈‍⬛': ['clowder', 'cats'],
  '🦁': ['pride', 'lions'],
  '🐯': ['ambush', 'tigers'],
  '🐅': ['ambush', 'tigers'],
  '🐆': ['leap', 'leopards'],
  '🐴': ['herd', 'horses'],
  '🐎': ['herd', 'horses'],
  '🦄': ['blessing', 'unicorns'],
  '🦓': ['dazzle', 'zebras'],
  '🦬': ['herd', 'bison'],
  '🐮': ['herd', 'cows'],
  '🐂': ['team', 'oxen'],
  '🐃': ['herd', 'buffalo'],
  '🐄': ['herd', 'cows'],
  '🐷': ['drove', 'pigs'],
  '🐖': ['drove', 'pigs'],
  '🐗': ['sounder', 'boars'],
  '🐏': ['flock', 'rams'],
  '🐑': ['flock', 'sheep'],
  '🐐': ['tribe', 'goats'],
  '🐪': ['caravan', 'camels'],
  '🐫': ['caravan', 'camels'],
  '🦙': ['herd', 'llamas'],
  '🦒': ['tower', 'giraffes'],
  '🐘': ['parade', 'elephants'],
  '🦣': ['herd', 'mammoths'],
  '🦏': ['crash', 'rhinos'],
  '🦛': ['bloat', 'hippos'],
  '🐁': ['mischief', 'mice'],
  '🐀': ['mischief', 'rats'],
  '🐹': ['horde', 'hamsters'],
  '🦔': ['array', 'hedgehogs'],
  '🐻‍❄️': ['sleuth', 'polar bears'],
  '🐨': ['cuddle', 'koalas'],
  '🐼': ['embarrassment', 'pandas'],
  '🦥': ['bed', 'sloths'],
  '🦦': ['raft', 'otters'],
  '🦘': ['mob', 'kangaroos'],
  '🦡': ['cete', 'badgers'],
  '🫎': ['herd', 'moose'],
  '🦍': ['troop', 'gorillas'],
  '🦧': ['buffoonery', 'orangutans'],
  '🐒': ['troop', 'monkeys'],

  // Birds
  '🐔': ['brood', 'chickens'],
  '🐓': ['flock', 'roosters'],
  '🐣': ['clutch', 'chicks'],
  '🐤': ['clutch', 'chicks'],
  '🐥': ['clutch', 'chicks'],
  '🐧': ['waddle', 'penguins'],
  '🕊️': ['dule', 'doves'],
  '🦢': ['bevy', 'swans'],
  '🪿': ['gaggle', 'geese'],
  '🦤': ['flock', 'dodos'],
  '🦩': ['flamboyance', 'flamingos'],
  '🦚': ['ostentation', 'peacocks'],
  '🦜': ['pandemonium', 'parrots'],
  '🐦‍⬛': ['cloud', 'blackbirds'],

  // Reptiles & amphibians
  '🐊': ['bask', 'crocodiles'],
  '🦎': ['lounge', 'lizards'],
  '🐉': ['flight', 'dragons'],
  '🐲': ['flight', 'dragons'],
  '🦕': ['herd', 'dinosaurs'],
  '🦖': ['herd', 'dinosaurs'],

  // Sea life
  '🐳': ['pod', 'whales'],
  '🐋': ['pod', 'whales'],
  '🐬': ['pod', 'dolphins'],
  '🦭': ['colony', 'seals'],
  '🐟': ['school', 'fish'],
  '🐠': ['school', 'fish'],
  '🐡': ['school', 'pufferfish'],
  '🦈': ['shiver', 'sharks'],
  '🐙': ['consortium', 'octopuses'],
  '🦀': ['cast', 'crabs'],
  '🦞': ['risk', 'lobsters'],
  '🦐': ['school', 'shrimp'],
  '🦑': ['squad', 'squid'],
  '🦪': ['bed', 'oysters'],

  // Bugs
  '🐌': ['rout', 'snails'],
  '🦋': ['kaleidoscope', 'butterflies'],
  '🐛': ['army', 'caterpillars'],
  '🐜': ['colony', 'ants'],
  '🐝': ['swarm', 'bees'],
  '🪲': ['swarm', 'beetles'],
  '🐞': ['loveliness', 'ladybugs'],
  '🦗': ['orchestra', 'crickets'],
  '🪳': ['intrusion', 'cockroaches'],
  '🕷️': ['cluster', 'spiders'],
  '🦂': ['bed', 'scorpions'],
  '🦟': ['scourge', 'mosquitoes'],
  '🪰': ['swarm', 'flies'],
  '🪱': ['clew', 'worms'],

  // Custom critters
  'custom:robin': ['round', 'robins'],
  'custom:cardinal': ['college', 'cardinals'],
  'custom:blue-jay': ['party', 'blue jays'],
  'custom:chickadee': ['banditry', 'chickadees'],
  'custom:goldfinch': ['charm', 'goldfinches'],
  'custom:sparrow': ['host', 'sparrows'],
  'custom:seagull': ['squabble', 'seagulls'],
  'custom:groundhog': ['repetition', 'groundhogs'],
  'custom:opossum': ['passel', 'opossums'],
  'custom:bobcat': ['clowder', 'bobcats'],
  'custom:loon': ['asylum', 'loons'],
  'custom:puffin': ['circus', 'puffins'],
  'custom:grouse': ['covey', 'grouse'],
  'custom:firefly': ['swarm', 'fireflies'],
  'custom:gritty': ['chaos', 'Grittys'],
  'custom:meerkat': ['mob', 'meerkats'],
  'custom:lemur': ['conspiracy', 'lemurs'],
  'custom:crane': ['sedge', 'cranes'],
  'custom:canada-goose': ['gaggle', 'Canada geese'],
  'custom:pigeon': ['kit', 'pigeons'],
  'custom:highland-cow': ['fold', 'Highland cows'],
  'custom:capybara': ['herd', 'capybaras'],
  'custom:monarch-butterfly': ['kaleidoscope', 'monarchs'],
  'custom:pelican': ['squadron', 'pelicans'],
  'custom:horseshoe-crab': ['cast', 'horseshoe crabs'],
  'custom:stingray': ['fever', 'stingrays'],
  'custom:hawk': ['kettle', 'hawks'],
  'custom:lantern-fly': ['swarm', 'lantern flies'],
  'custom:emu': ['mob', 'emus'],
  'custom:wren': ['herd', 'wrens'],
  'custom:crow': ['murder', 'crows'],
  'custom:dragonfly': ['cluster', 'dragonflies'],
  'custom:hummingbird': ['glittering', 'hummingbirds'],
  'custom:grasshopper': ['cloud', 'grasshoppers'],
}

/** Keyed without the variation selector, so both spellings of '🐿️' resolve.
 *  A Map also keeps `['toString']` from answering with Object.prototype's — the
 *  emoji column holds arbitrary text, and a plain object would. */
const BY_KEY = new Map(Object.entries(COLLECTIVE_NOUNS).map(([key, entry]) => [emojiKey(key), entry]))

function entryFor(emoji: string): readonly [string, string] | null {
  return BY_KEY.get(emojiKey(emoji)) ?? null
}

/** The collective noun for a critter, or null when it hasn't got one. */
export function nounFor(emoji: string): string | null {
  return entryFor(emoji)?.[0] ?? null
}

/** The full phrase — "a murder of crows", "an army of frogs" — or null. */
export function phraseFor(emoji: string): string | null {
  const entry = entryFor(emoji)
  if (entry === null) return null
  const [noun, plural] = entry
  const article = 'aeiou'.includes(noun[0]) ? 'an' : 'a'
  return `${article} ${noun} of ${plural}`
}
