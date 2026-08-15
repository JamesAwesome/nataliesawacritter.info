import { phraseFor } from './collectiveNouns.js'

export type Quantity = '1' | '2' | '3' | 'many'

/** Must match the client picker set (src/lib/quantity.ts); pinned both sides. */
export const QUANTITIES: readonly Quantity[] = ['1', '2', '3', 'many']

export function isQuantity(value: unknown): value is Quantity {
  return typeof value === 'string' && (QUANTITIES as readonly string[]).includes(value)
}

/** Inline text suffix for feed titles / push bodies: '1' → '', 2/3 → ' ×N',
 *  many → the critter's collective-noun phrase (' · a murder of crows'), or
 *  ' · Many' if it hasn't got one. Text surfaces have room for the whole
 *  phrase; the client's quantityLabel shows just the noun in its badge. */
export function quantityTextSuffix(quantity: Quantity, emoji: string): string {
  if (quantity === '1') return ''
  if (quantity === 'many') {
    const phrase = phraseFor(emoji)
    return phrase === null ? ' · Many' : ` · ${phrase}`
  }
  return ` ×${quantity}`
}
