import { useState } from 'react'
import type { NewProfileInput, NewSightingInput, Profile } from '../api'
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
  /** When provided, DetailsForm shows a "save as friend" toggle; the friend
   *  saves best-effort after the sighting (failures never block logging). */
  onSaveFriend?: (fields: NewProfileInput, authHeader: string) => Promise<void>
  /** When provided, arriving via a friend tile shows a status line with a
   *  two-tap Remove in place of the save-as-friend checkbox. */
  onRemoveFriend?: (id: string, authHeader: string) => Promise<void>
}

type Picked = { emoji: string; name: string | null; place: string | null; friendId: string | null }

export function LogSightingFlow({
  open,
  onClose,
  onSave,
  onLogged,
  recent = [],
  friends = [],
  onSaveFriend,
  onRemoveFriend,
}: Props) {
  const [picked, setPicked] = useState<Picked | null>(null)
  const write = useWriteAction({
    disabled: 'Saving is disabled right now',
    failed: "Couldn't save — try again",
  })
  const removeWrite = useWriteAction({
    disabled: 'Removing is disabled right now',
    failed: "Couldn't remove — try again",
  })

  // Live lookup: once the friend is removed it drops out of `friends`, so the
  // status line reverts to the checkbox without remounting the draft.
  const pickedFriend =
    picked?.friendId != null && onRemoveFriend !== undefined
      ? (friends.find((f) => f.id === picked.friendId) ?? null)
      : null

  function close() {
    write.abandon()
    removeWrite.abandon()
    setPicked(null)
    onClose()
  }

  function save(fields: NewSightingInput, opts?: { saveAsFriend: boolean }) {
    write.run(
      async (authHeader) => {
        await onSave(fields, authHeader)
        if (opts?.saveAsFriend && fields.name !== undefined && onSaveFriend !== undefined) {
          // Best-effort: the sighting is already logged; a failed friend save
          // must not surface as a logging error (Sighting Detail's toggle is
          // the recovery path). 409 already-a-friend resolves inside addProfile.
          try {
            await onSaveFriend({ emoji: fields.emoji, name: fields.name, place: fields.place }, authHeader)
          } catch {
            // silent by design
          }
        }
      },
      () => {
        setPicked(null)
        onLogged()
      },
    )
  }

  function removeFriend() {
    if (pickedFriend === null || onRemoveFriend === undefined) return
    const { id } = pickedFriend
    removeWrite.run((authHeader) => onRemoveFriend(id, authHeader), () => {})
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
          onPick={(emoji, name) => setPicked({ emoji, name, place: null, friendId: null })}
          onPickFriend={(p) => setPicked({ emoji: p.emoji, name: p.name, place: p.place, friendId: p.id })}
          onCancel={close}
        />
      ) : (
        <div className="flow-details">
          {write.actionError !== null && <p className="flow-error">{write.actionError}</p>}
          {removeWrite.actionError !== null && <p className="flow-error">{removeWrite.actionError}</p>}
          <DetailsForm
            key={[picked.emoji, picked.name ?? '', picked.place ?? ''].join(' ')}
            emoji={picked.emoji}
            initialName={picked.name}
            initialPlace={picked.place}
            saving={write.busy || removeWrite.busy || removeWrite.prompt.open}
            onBack={() => setPicked(null)}
            onSave={save}
            friendToggle={onSaveFriend !== undefined}
            sourceFriend={pickedFriend}
            onRemoveFriend={removeFriend}
            removing={removeWrite.busy || write.busy || write.prompt.open}
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
          {removeWrite.prompt.open && (
            <div className="prompt-overlay">
              <PasswordPrompt
                open
                error={removeWrite.prompt.error}
                onCancel={removeWrite.prompt.onCancel}
                onSubmit={removeWrite.prompt.onSubmit}
              />
            </div>
          )}
        </div>
      )}
    </Sheet>
  )
}
