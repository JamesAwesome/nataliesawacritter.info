import { useState } from 'react'
import { CURATED, EXTENDED, nameFor } from '../lib/critters'

type Props = {
  recent: string[]
  onPick: (emoji: string, name: string | null) => void
  onCancel: () => void
}

export function EmojiPicker({ recent, onPick, onCancel }: Props) {
  const [showExtended, setShowExtended] = useState(false)
  return (
    <div className="emoji-picker">
      <h2 className="sheet-heading">What did Natalie see?</h2>
      {recent.length > 0 && (
        <>
          <h3 className="picker-recent-heading">Recently seen</h3>
          <div className="picker-grid picker-grid-recent">
            {recent.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="picker-tile"
                aria-label={`Recently seen ${nameFor(emoji) ?? emoji}`}
                onClick={() => onPick(emoji, nameFor(emoji))}
              >
                {emoji}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="picker-grid">
        {CURATED.map((c) => (
          <button
            key={c.emoji}
            type="button"
            className="picker-tile"
            style={{ background: c.tint }}
            aria-label={c.name}
            onClick={() => onPick(c.emoji, c.name)}
          >
            {c.emoji}
          </button>
        ))}
        <button
          type="button"
          className="picker-tile picker-other"
          onClick={() => setShowExtended(true)}
        >
          Other
        </button>
      </div>
      {showExtended && (
        <>
          <hr className="picker-divider" />
          <div className="picker-grid picker-grid-extended">
            {EXTENDED.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="picker-tile"
                aria-label={emoji}
                onClick={() => onPick(emoji, null)}
              >
                {emoji}
              </button>
            ))}
          </div>
        </>
      )}
      <button type="button" className="btn-secondary flow-cancel" onClick={onCancel}>
        Cancel
      </button>
    </div>
  )
}
