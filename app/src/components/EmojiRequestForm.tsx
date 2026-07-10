import { useEffect, useState } from 'react'
import { createEmojiRequest, deleteEmojiRequest, listEmojiRequests, type EmojiRequest } from '../api'
import { basicHeader, getCredentials } from '../auth'

type Props = { onBack: () => void }

function authHeader(): string | null {
  const creds = getCredentials()
  return creds === null ? null : basicHeader(creds)
}

/** Shown inside the (already write-gated) log flow, so it reads/writes the
 *  owner-only /api/emoji-requests directly with the stored credentials. */
export function EmojiRequestForm({ onBack }: Props) {
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [requests, setRequests] = useState<EmojiRequest[]>([])
  const [saving, setSaving] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    const auth = authHeader()
    if (auth === null) return
    try {
      setRequests(await listEmojiRequests(auth))
    } catch {
      // A list failure just leaves the section empty; submitting still works.
    }
  }

  // Initial owner-list load. setState lives in the promise callback (guarded by
  // `cancelled`), matching useSightings — keeps it out of the effect body.
  useEffect(() => {
    const auth = authHeader()
    if (auth === null) return
    let cancelled = false
    listEmojiRequests(auth)
      .then((rows) => {
        if (!cancelled) setRequests(rows)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  async function submit() {
    const auth = authHeader()
    const trimmed = name.trim()
    if (auth === null || trimmed === '') return
    setSaving(true)
    setError(null)
    try {
      await createEmojiRequest({ name: trimmed, note: note.trim() || undefined }, auth)
      setName('')
      setNote('')
      setSent(true)
      await refresh()
    } catch {
      setError("Couldn't send — try again")
    } finally {
      setSaving(false)
    }
  }

  async function dismiss(id: string) {
    const auth = authHeader()
    if (auth === null) return
    try {
      await deleteEmojiRequest(id, auth)
      setRequests((current) => current.filter((r) => r.id !== id))
    } catch {
      // Leave the row in place so it can be retried.
    }
  }

  return (
    <div className="emoji-request">
      <h2 className="sheet-heading">Request an emoji</h2>
      <label className="field">
        What critter?
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setSent(false)
          }}
          placeholder="Pigeon, Otter, ..."
        />
      </label>
      <label className="field">
        Anything else? (optional)
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Color, where you saw it..." />
      </label>
      {error !== null && <p className="flow-error">{error}</p>}
      {sent && <p className="request-sent">Thanks! Request sent 🎉</p>}
      <div className="details-actions">
        <button type="button" className="btn-secondary" onClick={onBack}>
          Back
        </button>
        <button type="button" className="btn-primary" onClick={submit} disabled={saving || name.trim() === ''}>
          Send request
        </button>
      </div>
      {requests.length > 0 && (
        <>
          <h3 className="picker-recent-heading">Requests</h3>
          <ul className="request-list">
            {requests.map((r) => (
              <li key={r.id} className="request-row">
                <span className="request-main">
                  <span className="request-name">{r.name}</span>
                  {r.note !== null && <span className="request-note">{r.note}</span>}
                </span>
                {r.outcome === 'pr-opened' && r.prUrl !== null && (
                  <a className="request-status request-pr" href={r.prUrl} target="_blank" rel="noreferrer">
                    PR ↗
                  </a>
                )}
                {(r.outcome === 'skipped-copyright' || r.outcome === 'skipped-unclear') && (
                  <span className="request-status request-skipped">skipped</span>
                )}
                <button
                  type="button"
                  className="request-dismiss"
                  aria-label={`Dismiss ${r.name}`}
                  onClick={() => void dismiss(r.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
