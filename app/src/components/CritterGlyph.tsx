import { customFor } from '../lib/customEmoji'

/** Renders a critter's glyph: a custom-emoji token as its SVG image, or a
 *  Unicode emoji as text (unchanged from before custom emoji existed). The
 *  image is decorative (alt="") — callers carry the accessible name. */
export function CritterGlyph({ emoji, className }: { emoji: string; className?: string }) {
  const custom = customFor(emoji)
  if (custom !== null) {
    return <img className={className} src={`/custom-emoji/${custom.slug}.svg`} alt="" />
  }
  return (
    <span className={className} aria-hidden="true">
      {emoji}
    </span>
  )
}
