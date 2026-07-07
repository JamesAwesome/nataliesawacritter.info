import { useEffect, useRef, useState } from 'react'
import type { NewSightingInput, Profile } from '../api'
import { normalizedName } from '../lib/critters'
import { nowClockTime } from '../lib/format'
import { CritterGlyph } from './CritterGlyph'
import { PhotoControl } from './PhotoControl'

type Props = {
  emoji: string
  initialName: string | null
  onBack: () => void
  onSave: (fields: NewSightingInput, opts?: { saveAsFriend: boolean; photo: Blob | null }) => void
  saving: boolean
  initialPlace?: string | null
  /** When true, renders the "⭐ Save as a friend" checkbox and passes its state via onSave's opts. */
  friendToggle?: boolean
  /** The still-existing friend profile this form was opened from (live lookup —
   *  null once removed). While the name field still matches it, the checkbox
   *  slot shows a friend status line with a two-tap Remove instead. */
  sourceFriend?: Profile | null
  onRemoveFriend?: () => void
  removing?: boolean
  /** When true, renders the photo picker and passes its held blob via onSave's opts. */
  photoControl?: boolean
}

const CONFIRM_WINDOW_MS = 4000

function today(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

export function DetailsForm({
  emoji,
  initialName,
  onBack,
  onSave,
  saving,
  initialPlace,
  friendToggle,
  sourceFriend,
  onRemoveFriend,
  removing,
  photoControl,
}: Props) {
  const [name, setName] = useState(initialName ?? '')
  const [sightedOn, setSightedOn] = useState(today)
  const [sightedTime, setSightedTime] = useState('')
  const [place, setPlace] = useState(initialPlace ?? '')
  const [comment, setComment] = useState('')
  const [saveAsFriend, setSaveAsFriend] = useState(false)
  const [photo, setPhoto] = useState<Blob | null>(null)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const confirmTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(confirmTimer.current), [])

  // One predicate drives one slot: while the (live) source friend's name still
  // matches the field, show the status line; edit it away and the ordinary
  // save-as-friend checkbox returns (a renamed critter is befriendable).
  const liveFriend =
    sourceFriend != null && normalizedName(sourceFriend.name) === normalizedName(name) ? sourceFriend : null

  function save() {
    const fields: NewSightingInput = { emoji, sightedOn }
    // Trim name/place: they feed friend identity (emoji, name) downstream.
    const trimmedName = name.trim()
    const trimmedPlace = place.trim()
    if (trimmedName !== '') fields.name = trimmedName
    if (sightedTime !== '') fields.sightedTime = sightedTime
    if (trimmedPlace !== '') fields.place = trimmedPlace
    if (comment !== '') fields.comment = comment
    if (friendToggle || photoControl) {
      onSave(fields, {
        saveAsFriend: friendToggle === true && saveAsFriend && trimmedName !== '' && liveFriend === null,
        photo,
      })
    } else {
      onSave(fields)
    }
  }

  function onRemoveClick() {
    if (!confirmingRemove) {
      setConfirmingRemove(true)
      clearTimeout(confirmTimer.current)
      confirmTimer.current = setTimeout(() => setConfirmingRemove(false), CONFIRM_WINDOW_MS)
      return
    }
    clearTimeout(confirmTimer.current)
    setConfirmingRemove(false)
    onRemoveFriend?.()
  }

  return (
    <div className="details-form">
      <div className="details-head">
        <CritterGlyph emoji={emoji} className="details-emoji" />
        <label className="field grow">
          Critter name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Critter name" />
        </label>
      </div>
      <div className="details-row">
        <label className="field">
          Date
          <input
            type="date"
            value={sightedOn}
            max={today()}
            onChange={(e) => setSightedOn(e.target.value)}
          />
        </label>
        <label className="field">
          Time
          <div className="time-row">
            <input
              type="time"
              value={sightedTime}
              onChange={(e) => setSightedTime(e.target.value)}
            />
            <button type="button" className="btn-secondary btn-now" onClick={() => setSightedTime(nowClockTime())}>
              Now
            </button>
          </div>
        </label>
      </div>
      <label className="field">
        Where?
        <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Where? (backyard, trail...)" />
        <span className="field-hint">
          <strong>Public:</strong> don't reveal where you live or exactly where you are.
        </span>
      </label>
      <label className="field">
        Comment
        <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Comment (optional)" />
      </label>
      {photoControl && <PhotoControl photo={photo} onPhoto={setPhoto} />}
      {liveFriend !== null ? (
        <p className="friend-status">
          ⭐ {liveFriend.name} is one of Natalie's friends ·{' '}
          <button
            type="button"
            className={confirmingRemove ? 'friend-remove confirming' : 'friend-remove'}
            disabled={removing}
            onClick={onRemoveClick}
          >
            {confirmingRemove ? 'Really remove?' : 'Remove'}
          </button>
        </p>
      ) : (
        friendToggle && (
          <label className="friend-checkbox">
            <input
              type="checkbox"
              checked={saveAsFriend}
              disabled={name.trim() === ''}
              onChange={(e) => setSaveAsFriend(e.target.checked)}
            />
            ⭐ Save as a friend
          </label>
        )
      )}
      <div className="details-actions">
        <button type="button" className="btn-secondary" onClick={onBack}>
          Back
        </button>
        <button type="button" className="btn-primary" onClick={save} disabled={saving || sightedOn === '' || sightedOn > today()}>
          Save sighting
        </button>
      </div>
    </div>
  )
}
