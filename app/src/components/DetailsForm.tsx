import { useState } from 'react'
import type { NewSightingInput } from '../api'
import { formatClockTime, nowClockTime } from '../lib/format'

type Props = {
  emoji: string
  initialName: string | null
  onBack: () => void
  onSave: (fields: NewSightingInput, opts?: { saveAsFriend: boolean }) => void
  saving: boolean
  initialPlace?: string | null
  /** When true, renders the "⭐ Save as a friend" checkbox and passes its state via onSave's opts. */
  friendToggle?: boolean
}

function today(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

export function DetailsForm({ emoji, initialName, onBack, onSave, saving, initialPlace, friendToggle }: Props) {
  const [name, setName] = useState(initialName ?? '')
  const [sightedOn, setSightedOn] = useState(today)
  const [sightedTime, setSightedTime] = useState('')
  const [place, setPlace] = useState(initialPlace ?? '')
  const [comment, setComment] = useState('')
  const [saveAsFriend, setSaveAsFriend] = useState(false)

  function save() {
    const fields: NewSightingInput = { emoji, sightedOn }
    // Trim name/place: they feed friend identity (emoji, name) downstream.
    const trimmedName = name.trim()
    const trimmedPlace = place.trim()
    if (trimmedName !== '') fields.name = trimmedName
    if (sightedTime !== '') fields.sightedTime = formatClockTime(sightedTime)
    if (trimmedPlace !== '') fields.place = trimmedPlace
    if (comment !== '') fields.comment = comment
    if (friendToggle) {
      // A friend needs a name — an empty name silently drops the request.
      onSave(fields, { saveAsFriend: saveAsFriend && trimmedName !== '' })
    } else {
      onSave(fields)
    }
  }

  return (
    <div className="details-form">
      <div className="details-head">
        <span className="details-emoji" aria-hidden="true">{emoji}</span>
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
      </label>
      <label className="field">
        Comment
        <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Comment (optional)" />
      </label>
      {friendToggle && (
        <label className="friend-checkbox">
          <input
            type="checkbox"
            checked={saveAsFriend}
            disabled={name.trim() === ''}
            onChange={(e) => setSaveAsFriend(e.target.checked)}
          />
          ⭐ Save as a friend
        </label>
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
