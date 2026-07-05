import { useRef, useState } from 'react'
import { downscalePhoto } from '../lib/photo'

type Props = {
  photo: Blob | null
  onPhoto: (photo: Blob | null) => void
}

export function PhotoControl({ photo, onPhoto }: Props) {
  const [preparing, setPreparing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function onPick(file: File | undefined) {
    if (file === undefined) return
    setPreparing(true)
    setError(null)
    try {
      onPhoto(await downscalePhoto(file))
    } catch {
      setError("Couldn't read that photo")
    } finally {
      setPreparing(false)
      if (inputRef.current !== null) inputRef.current.value = ''
    }
  }

  if (photo !== null) {
    return (
      <div className="photo-control added">
        <span>✓ Photo added</span>
        <button type="button" className="photo-clear" aria-label="Remove photo" onClick={() => onPhoto(null)}>
          ✕
        </button>
      </div>
    )
  }

  return (
    <div className="photo-control">
      <label className={preparing ? 'photo-add preparing' : 'photo-add'}>
        {preparing ? 'Preparing…' : '📷 Add a photo'}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          disabled={preparing}
          onChange={(e) => void onPick(e.target.files?.[0])}
        />
      </label>
      {error !== null && <p className="flow-error" data-testid="photo-error">{error}</p>}
    </div>
  )
}
