import { useState } from 'react'
import type { NewSightingInput, Profile } from '../api'
import { useWriteAction } from '../hooks/useWriteAction'
import { PasswordPrompt } from './PasswordPrompt'
import { Sheet } from './Sheet'
import { DetailsForm } from './DetailsForm'
import { EmojiPicker } from './EmojiPicker'

type Props = {
  open: boolean
  onClose: () => void
  onSave: (fields: NewSightingInput, authHeader: string) => Promise<void>
  onLogged: () => void
  recent?: string[]
  friends?: Profile[]
}

type Picked = { emoji: string; name: string | null; place: string | null }

export function LogSightingFlow({ open, onClose, onSave, onLogged, recent = [], friends = [] }: Props) {
  const [picked, setPicked] = useState<Picked | null>(null)
  const write = useWriteAction({
    disabled: 'Saving is disabled right now',
    failed: "Couldn't save — try again",
  })

  function close() {
    write.abandon()
    setPicked(null)
    onClose()
  }

  function save(fields: NewSightingInput) {
    write.run(
      (authHeader) => onSave(fields, authHeader),
      () => {
        setPicked(null)
        onLogged()
      },
    )
  }

  // The draft lives in DetailsForm's state, so the form must stay MOUNTED while
  // the password prompt shows (401/no-creds paths preserve the draft). The
  // prompt therefore renders as an overlay inside the details branch, never as
  // a replacement for it — a prompt can only appear after Save, i.e. when the
  // details step is active.
  return (
    <Sheet open={open} onClose={close}>
      {picked === null ? (
        <EmojiPicker
          recent={recent}
          friends={friends}
          onPick={(emoji, name) => setPicked({ emoji, name, place: null })}
          onPickFriend={(p) => setPicked({ emoji: p.emoji, name: p.name, place: p.place })}
          onCancel={close}
        />
      ) : (
        <div className="flow-details">
          {write.actionError !== null && <p className="flow-error">{write.actionError}</p>}
          <DetailsForm
            key={picked.emoji + (picked.name ?? '') + (picked.place ?? '')}
            emoji={picked.emoji}
            initialName={picked.name}
            initialPlace={picked.place}
            saving={write.busy}
            onBack={() => setPicked(null)}
            onSave={save}
          />
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
      )}
    </Sheet>
  )
}
