import { useState, type ReactNode } from 'react'
import type { Profile } from '../api'
import { CURATED, nameFor } from '../lib/critters'
import { CATEGORIES } from '../lib/emojiCategories'
import { CritterGlyph } from './CritterGlyph'

type Props = {
  recent: string[]
  onPick: (emoji: string, name: string | null) => void
  onCancel: () => void
  friends?: Profile[]
  onPickFriend?: (profile: Profile) => void
  /** When provided, renders a "Request an emoji" link that opens the request form. */
  onRequestEmoji?: () => void
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

export function EmojiPicker({ recent, onPick, onCancel, friends = [], onPickFriend, onRequestEmoji }: Props) {
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
                <CritterGlyph emoji={profile.emoji} />
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
                <CritterGlyph emoji={emoji} />
              </PickerTile>
            ))}
          </div>
        </>
      )}
      <div className="picker-grid">
        {CURATED.map((c) => (
          <PickerTile key={c.emoji} tint={c.tint} ariaLabel={c.name} onClick={() => onPick(c.emoji, c.name)}>
            <CritterGlyph emoji={c.emoji} />
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
          {CATEGORIES.map((cat) => (
            <div key={cat.key} className="picker-category">
              <h3 className="picker-recent-heading">{cat.label}</h3>
              <div className="picker-grid picker-grid-extended">
                {cat.items.map((item) => (
                  <PickerTile
                    key={item}
                    ariaLabel={nameFor(item) ?? item}
                    onClick={() => onPick(item, nameFor(item))}
                  >
                    <CritterGlyph emoji={item} />
                  </PickerTile>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
      {onRequestEmoji !== undefined && (
        <button type="button" className="btn-secondary picker-request" onClick={onRequestEmoji}>
          ✨ Don't see it? Request an emoji
        </button>
      )}
      <button type="button" className="btn-secondary flow-cancel" onClick={onCancel}>
        Cancel
      </button>
    </div>
  )
}
