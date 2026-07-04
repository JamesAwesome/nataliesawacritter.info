import { useEffect, useRef, useState } from 'react'
import type { Sighting } from '../api'
import { useWriteAction } from '../hooks/useWriteAction'
import { formatWhen } from '../lib/format'
import { PasswordPrompt } from './PasswordPrompt'

type Props = {
  sighting: Sighting
  onBack: () => void
  onDeleted: () => void
  removeSighting: (id: string, authHeader: string) => Promise<void>
}

const CONFIRM_WINDOW_MS = 4000

export function SightingDetail({ sighting, onBack, onDeleted, removeSighting }: Props) {
  const write = useWriteAction({
    disabled: 'Deleting is disabled right now',
    failed: "Couldn't delete — try again",
  })
  const [confirming, setConfirming] = useState(false)
  const confirmTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(confirmTimer.current), [])

  function onDeleteClick() {
    if (!confirming) {
      setConfirming(true)
      clearTimeout(confirmTimer.current)
      confirmTimer.current = setTimeout(() => setConfirming(false), CONFIRM_WINDOW_MS)
      return
    }
    clearTimeout(confirmTimer.current)
    setConfirming(false)
    write.run((authHeader) => removeSighting(sighting.id, authHeader), onDeleted)
  }

  return (
    <div className="sighting-detail">
      <div className="detail-head">
        <span className="detail-emoji" aria-hidden="true">{sighting.emoji}</span>
        <h2>{sighting.name ?? sighting.emoji}</h2>
        <p className="detail-meta">{formatWhen(sighting.sightedOn, sighting.sightedTime)}</p>
      </div>
      {sighting.place !== null && (
        <p className="detail-place">
          📍 <strong>{sighting.place}</strong>
        </p>
      )}
      {sighting.comment !== null && <p className="detail-comment">{sighting.comment}</p>}
      {write.actionError !== null && <p className="flow-error">{write.actionError}</p>}
      <div className="details-actions">
        <button type="button" className="btn-secondary" onClick={onBack}>
          Back
        </button>
        <button
          type="button"
          className={confirming ? 'btn-danger confirming' : 'btn-danger'}
          disabled={write.busy}
          onClick={onDeleteClick}
        >
          {confirming ? 'Really delete?' : 'Delete'}
        </button>
      </div>
      {write.prompt.open && (
        <div className="prompt-overlay">
          <PasswordPrompt
            open
            error={write.prompt.error}
            onCancel={write.prompt.onCancel}
            onSubmit={write.prompt.onSubmit}
          />
        </div>
      )}
    </div>
  )
}
