import { useState, type ReactNode } from 'react'
import type { Profile } from '../api'
import { CURATED, EXTENDED, nameFor } from '../lib/critters'

type Props = {
  recent: string[]
  onPick: (emoji: string, name: string | null) => void
  onCancel: () => void
  friends?: Profile[]
  onPickFriend?: (profile: Profile) => void
}

type TileProps = {
  className?: string
  ariaLabel?: string
  tint?: string
  onClick: () => void
  children: ReactNode
}

function PickerTile({ className, ariaLabel, tint, onClick, children }: TileProps) {
  return (
    <button
      type="button"
      className={className === undefined ? 'picker-tile' : `picker-tile ${className}`}
      style={tint === undefined ? undefined : { background: tint }}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export function EmojiPicker({ recent, onPick, onCancel, friends = [], onPickFriend }: Props) {
  const [showExtended, setShowExtended] = useState(false)
  return (
    <div className="emoji-picker">
      <h2 className="sheet-heading">What did Natalie see?</h2>
      {friends.length > 0 && (
        <>
          <h3 className="picker-recent-heading">Friends</h3>
          <div className="picker-grid picker-grid-recent">
            {friends.map((profile) => (
              <PickerTile
                key={profile.id}
                className="friend-tile"
                ariaLabel={`Friend ${profile.name}`}
                onClick={() => onPickFriend?.(profile)}
              >
                <span aria-hidden="true">{profile.emoji}</span>
                <span className="friend-name">{profile.name}</span>
              </PickerTile>
            ))}
          </div>
        </>
      )}
      {recent.length > 0 && (
        <>
          <h3 className="picker-recent-heading">Recently seen</h3>
          <div className="picker-grid picker-grid-recent">
            {recent.map((emoji) => (
              <PickerTile
                key={emoji}
                ariaLabel={`Recently seen ${nameFor(emoji) ?? emoji}`}
                onClick={() => onPick(emoji, nameFor(emoji))}
              >
                {emoji}
              </PickerTile>
            ))}
          </div>
        </>
      )}
      <div className="picker-grid">
        {CURATED.map((c) => (
          <PickerTile key={c.emoji} tint={c.tint} ariaLabel={c.name} onClick={() => onPick(c.emoji, c.name)}>
            {c.emoji}
          </PickerTile>
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
              <PickerTile key={emoji} ariaLabel={emoji} onClick={() => onPick(emoji, null)}>
                {emoji}
              </PickerTile>
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
