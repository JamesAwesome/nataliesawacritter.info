import { useState } from 'react'
import type { NewSightingInput } from '../api'

type Props = {
  emoji: string
  initialName: string | null
  onBack: () => void
  onSave: (fields: NewSightingInput) => void
  saving: boolean
}

function today(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

export function DetailsForm({ emoji, initialName, onBack, onSave, saving }: Props) {
  const [name, setName] = useState(initialName ?? '')
  const [sightedOn, setSightedOn] = useState(today)
  const [sightedTime, setSightedTime] = useState('')
  const [place, setPlace] = useState('')
  const [comment, setComment] = useState('')

  function save() {
    const fields: NewSightingInput = { emoji, sightedOn }
    if (name !== '') fields.name = name
    if (sightedTime !== '') fields.sightedTime = sightedTime
    if (place !== '') fields.place = place
    if (comment !== '') fields.comment = comment
    onSave(fields)
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
          <input type="date" value={sightedOn} onChange={(e) => setSightedOn(e.target.value)} />
        </label>
        <label className="field">
          Time
          <input value={sightedTime} onChange={(e) => setSightedTime(e.target.value)} placeholder="Time" />
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
      <div className="details-actions">
        <button type="button" className="btn-secondary" onClick={onBack}>
          Back
        </button>
        <button type="button" className="btn-primary" onClick={save} disabled={saving || sightedOn === ''}>
          Save sighting
        </button>
      </div>
    </div>
  )
}
