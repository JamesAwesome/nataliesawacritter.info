import { useState } from 'react'
import { ApiError, type NewSightingInput } from '../api'
import { basicHeader, clearCredentials, getCredentials, setCredentials } from '../auth'
import { PasswordPrompt } from './PasswordPrompt'
import { Sheet } from './Sheet'
import { DetailsForm } from './DetailsForm'
import { EmojiPicker } from './EmojiPicker'

type Props = {
  open: boolean
  onClose: () => void
  onSave: (fields: NewSightingInput, authHeader: string) => Promise<void>
  onLogged: () => void
}

type Picked = { emoji: string; name: string | null }

export function LogSightingFlow({ open, onClose, onSave, onLogged }: Props) {
  const [picked, setPicked] = useState<Picked | null>(null)
  const [pendingFields, setPendingFields] = useState<NewSightingInput | null>(null)
  const [promptError, setPromptError] = useState<string | null>(null)
  const [flowError, setFlowError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function reset() {
    setPicked(null)
    setPendingFields(null)
    setPromptError(null)
    setFlowError(null)
    setSaving(false)
  }

  function close() {
    reset()
    onClose()
  }

  async function attemptSave(fields: NewSightingInput, password?: string) {
    const creds = password !== undefined ? { user: 'natalie', password } : getCredentials()
    if (creds === null) {
      setPendingFields(fields)
      return
    }
    setSaving(true)
    setFlowError(null)
    try {
      await onSave(fields, basicHeader(creds))
      if (password !== undefined) setCredentials(password)
      reset()
      onLogged()
    } catch (err) {
      setSaving(false)
      if (err instanceof ApiError && err.status === 401) {
        clearCredentials()
        setPendingFields(fields)
        setPromptError('Wrong password — try again')
      } else if (err instanceof ApiError && err.status === 503) {
        setFlowError('Saving is disabled right now')
      } else {
        setFlowError("Couldn't save — try again")
      }
    }
  }

  // The draft lives in DetailsForm's state, so the form must stay MOUNTED while
  // the password prompt shows (401/no-creds paths preserve the draft). The
  // prompt therefore renders as an overlay inside the details branch, never as
  // a replacement for it — a prompt can only appear after Save, i.e. when the
  // details step is active.
  return (
    <Sheet open={open} onClose={close}>
      {picked === null ? (
        <EmojiPicker onPick={(emoji, name) => setPicked({ emoji, name })} onCancel={close} />
      ) : (
        <div className="flow-details">
          {flowError !== null && <p className="flow-error">{flowError}</p>}
          <DetailsForm
            key={picked.emoji + (picked.name ?? '')}
            emoji={picked.emoji}
            initialName={picked.name}
            saving={saving}
            onBack={() => setPicked(null)}
            onSave={(fields) => void attemptSave(fields)}
          />
          {pendingFields !== null && (
            <div className="prompt-overlay">
              <PasswordPrompt
                open
                error={promptError}
                onCancel={() => {
                  setPendingFields(null)
                  setPromptError(null)
                }}
                onSubmit={(password) => {
                  const fields = pendingFields
                  setPendingFields(null)
                  void attemptSave(fields, password)
                }}
              />
            </div>
          )}
        </div>
      )}
    </Sheet>
  )
}
