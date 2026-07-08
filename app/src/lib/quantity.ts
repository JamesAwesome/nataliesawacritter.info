export type Quantity = '1' | '2' | '3' | 'many'

/** Picker order; pinned by quantity.test.ts and mirrored server-side. */
export const QUANTITIES: readonly Quantity[] = ['1', '2', '3', 'many']

export function isQuantity(value: unknown): value is Quantity {
  return typeof value === 'string' && (QUANTITIES as readonly string[]).includes(value)
}

/** Badge shown next to a critter in the UI: '1' → none, 2/3 → '×N', many → 'Many'. */
export function quantityLabel(quantity: Quantity): string {
  if (quantity === '1') return ''
  if (quantity === 'many') return 'Many'
  return `×${quantity}`
}
