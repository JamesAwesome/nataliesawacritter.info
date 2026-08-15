import { phraseFor } from '../lib/collectiveNouns'
import { quantityLabel, type Quantity } from '../lib/quantity'

type Props = { quantity: Quantity; emoji: string }

/** The little count badge beside a critter's name: '×2', or — for a "many"
 *  sighting — the collective noun, with "a murder of crows" on hover and for
 *  screen readers. Nothing at all for a single critter. */
export function QuantityBadge({ quantity, emoji }: Props) {
  const label = quantityLabel(quantity, emoji)
  if (label === '') return null
  const phrase = quantity === 'many' ? phraseFor(emoji) : null
  if (phrase === null) return <span className="qty-badge">{label}</span>
  return (
    <>
      <span className="qty-badge" title={phrase} aria-hidden="true">{label}</span>
      <span className="visually-hidden">, {phrase}</span>
    </>
  )
}
