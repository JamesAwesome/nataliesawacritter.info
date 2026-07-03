import { useState } from 'react'

type Props = {
  open: boolean
  error: string | null
  onSubmit: (password: string) => void
  onCancel: () => void
}

export function PasswordPrompt({ open, error, onSubmit, onCancel }: Props) {
  const [password, setPassword] = useState('')
  if (!open) return null
  return (
    <div className="password-prompt">
      <h3>Natalie, what's the magic word?</h3>
      {error !== null && <p className="password-error">{error}</p>}
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
      </label>
      <div className="password-actions">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn-primary" onClick={() => onSubmit(password)}>
          Save
        </button>
      </div>
    </div>
  )
}
