import { nounFor } from './collectiveNouns'

export type Quantity = '1' | '2' | '3' | 'many'

/** Picker order; pinned by quantity.test.ts and mirrored server-side. */
export const QUANTITIES: readonly Quantity[] = ['1', '2', '3', 'many']

export function isQuantity(value: unknown): value is Quantity {
  return typeof value === 'string' && (QUANTITIES as readonly string[]).includes(value)
}

/** Badge shown next to a critter in the UI: '1' → none, 2/3 → '×N', many → the
 *  critter's collective noun ('Murder', 'Fluffle'), or 'Many' if it hasn't got one. */
export function quantityLabel(quantity: Quantity, emoji: string): string {
  if (quantity === '1') return ''
  if (quantity === 'many') {
    const noun = nounFor(emoji)
    return noun === null ? 'Many' : noun[0].toUpperCase() + noun.slice(1)
  }
  return `×${quantity}`
}
