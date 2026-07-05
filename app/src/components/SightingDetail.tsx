import { useEffect, useRef, useState } from 'react'
import type { NewProfileInput, Profile, Sighting } from '../api'
import { useWriteAction } from '../hooks/useWriteAction'
import { normalizedName } from '../lib/critters'
import { formatWhen } from '../lib/format'
import { downscalePhoto } from '../lib/photo'
import { PasswordPrompt } from './PasswordPrompt'
import { PhotoControl } from './PhotoControl'

type Props = {
  sighting: Sighting
  onBack: () => void
  onDeleted: () => void
  removeSighting: (id: string, authHeader: string) => Promise<void>
  profiles: Profile[]
  addProfile(fields: NewProfileInput, authHeader: string): Promise<void>
  removeProfile(id: string, authHeader: string): Promise<void>
  uploadPhoto(id: string, photo: Blob, authHeader: string): Promise<void>
  removePhoto(id: string, authHeader: string): Promise<void>
}

const CONFIRM_WINDOW_MS = 4000

export function SightingDetail({
  sighting,
  onBack,
  onDeleted,
  removeSighting,
  profiles,
  addProfile,
  removeProfile,
  uploadPhoto,
  removePhoto,
}: Props) {
  const write = useWriteAction({
    disabled: 'Deleting is disabled right now',
    failed: "Couldn't delete — try again",
  })
  const matching =
    sighting.name === null
      ? undefined
      : profiles.find(
          (p) => p.emoji === sighting.emoji && normalizedName(p.name) === normalizedName(sighting.name as string),
        )
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

  const [confirmingPhoto, setConfirmingPhoto] = useState(false)
  const photoConfirmTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(photoConfirmTimer.current), [])
  const [photoError, setPhotoError] = useState<string | null>(null)

  const PHOTO_MESSAGES = { disabled: 'Photos are disabled right now', failed: "Couldn't update the photo — try again" }

  async function onPickPhoto(file: File | undefined) {
    if (file === undefined) return
    setPhotoError(null)
    try {
      const blob = await downscalePhoto(file)
      write.run((authHeader) => uploadPhoto(sighting.id, blob, authHeader), () => {}, PHOTO_MESSAGES)
    } catch {
      setPhotoError("Couldn't read that photo")
    }
  }

  function onDetailPhoto(blob: Blob | null) {
    if (blob === null) return
    write.run((authHeader) => uploadPhoto(sighting.id, blob, authHeader), () => {}, PHOTO_MESSAGES)
  }

  function onRemovePhotoClick() {
    if (!confirmingPhoto) {
      setConfirmingPhoto(true)
      clearTimeout(photoConfirmTimer.current)
      photoConfirmTimer.current = setTimeout(() => setConfirmingPhoto(false), CONFIRM_WINDOW_MS)
      return
    }
    clearTimeout(photoConfirmTimer.current)
    setConfirmingPhoto(false)
    write.run((authHeader) => removePhoto(sighting.id, authHeader), () => {}, PHOTO_MESSAGES)
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
      {sighting.photoPath !== null ? (
        <div className="detail-photo-block">
          <img
            className="detail-photo"
            src={sighting.photoPath}
            alt={sighting.name ?? `${sighting.emoji} sighting`}
            loading="lazy"
          />
          <div className="photo-actions">
            <label className="photo-action" role="button">
              Replace photo
              <input
                type="file"
                accept="image/*"
                disabled={write.busy}
                onChange={(e) => void onPickPhoto(e.target.files?.[0])}
              />
            </label>
            <button
              type="button"
              className={confirmingPhoto ? 'photo-action danger confirming' : 'photo-action danger'}
              disabled={write.busy}
              onClick={onRemovePhotoClick}
            >
              {confirmingPhoto ? 'Really remove?' : 'Remove photo'}
            </button>
          </div>
        </div>
      ) : (
        <PhotoControl photo={null} onPhoto={(blob) => void onDetailPhoto(blob)} />
      )}
      {photoError !== null && <p className="flow-error">{photoError}</p>}
      {sighting.comment !== null && <p className="detail-comment">{sighting.comment}</p>}
      {sighting.name !== null && (
        <button
          type="button"
          className="btn-secondary friend-toggle"
          disabled={write.busy}
          onClick={() => {
            if (matching === undefined) {
              write.run(
                (authHeader) =>
                  addProfile(
                    { emoji: sighting.emoji, name: sighting.name as string, place: sighting.place ?? undefined },
                    authHeader,
                  ),
                () => {},
                { disabled: 'Saving is disabled right now', failed: "Couldn't save — try again" },
              )
            } else {
              write.run((authHeader) => removeProfile(matching.id, authHeader), () => {}, {
                disabled: 'Saving is disabled right now',
                failed: "Couldn't save — try again",
              })
            }
          }}
        >
          {matching === undefined ? '⭐ Save as friend' : 'Remove friend'}
        </button>
      )}
      {write.actionError !== null && <p className="flow-error" data-testid="detail-error">{write.actionError}</p>}
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
