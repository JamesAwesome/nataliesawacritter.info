import { useEffect, useRef, useState } from 'react'
import type { Sighting } from '../api'
import { nameFor } from '../lib/critters'
import { tapFeedback } from '../lib/haptics'
import { hasLiked } from '../lib/likes'

// Slightly longer than the CSS pop so the class outlives the animation, and so it
// still clears under prefers-reduced-motion (where no animationend fires).
const POP_MS = 300

type Props = { sighting: Sighting; onToggle: (sighting: Sighting) => void }

/** The heart + count control, shared by the feed rows and the detail view. Owns
 *  the satisfying-tap behavior: a springy pop and a haptic tick on a *new* like
 *  (never on unlike — removing a like isn't a reward). */
export function LikeButton({ sighting, onToggle }: Props) {
  const liked = hasLiked(sighting.id)
  const displayName = sighting.name ?? (nameFor(sighting.emoji) ?? sighting.emoji)
  const [popping, setPopping] = useState(false)
  const popTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(popTimer.current), [])

  function onClick() {
    if (!liked) {
      tapFeedback()
      setPopping(true)
      clearTimeout(popTimer.current)
      popTimer.current = setTimeout(() => setPopping(false), POP_MS)
    }
    onToggle(sighting)
  }

  return (
    <button
      type="button"
      className={`like-button${liked ? ' liked' : ''}${popping ? ' popping' : ''}`}
      aria-pressed={liked}
      aria-label={liked ? `Unlike ${displayName}` : `Like ${displayName}`}
      onClick={onClick}
    >
      <span className="like-heart" aria-hidden="true">{liked ? '❤️' : '🤍'}</span>
      {sighting.likeCount > 0 && <span className="like-count">{sighting.likeCount}</span>}
    </button>
  )
}
