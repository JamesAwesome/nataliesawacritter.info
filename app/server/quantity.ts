export type Quantity = '1' | '2' | '3' | 'many'

/** Must match the client picker set (src/lib/quantity.ts); pinned both sides. */
export const QUANTITIES: readonly Quantity[] = ['1', '2', '3', 'many']

export function isQuantity(value: unknown): value is Quantity {
  return typeof value === 'string' && (QUANTITIES as readonly string[]).includes(value)
}

/** Inline text suffix for feed titles / push bodies: '1' → '', 2/3 → ' ×N',
 *  many → ' · Many'. Server-only counterpart to the client's quantityLabel. */
export function quantityTextSuffix(quantity: Quantity): string {
  if (quantity === '1') return ''
  if (quantity === 'many') return ' · Many'
  return ` ×${quantity}`
}
