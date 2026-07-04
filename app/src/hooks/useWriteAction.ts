import { useRef, useState } from 'react'
import { ApiError } from '../api'
import { basicHeader, clearCredentials, getCredentials, setCredentials } from '../auth'

export type WriteMessages = { disabled: string; failed: string }

type Pending = { action: (authHeader: string) => Promise<void>; onSuccess: () => void }

export function useWriteAction(messages: WriteMessages) {
  const [pending, setPending] = useState<Pending | null>(null)
  const [promptError, setPromptError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const sessionRef = useRef(0)

  async function attempt(request: Pending, password?: string) {
    if (busy) return
    const session = sessionRef.current
    const creds = password !== undefined ? { user: 'natalie', password } : getCredentials()
    if (creds === null) {
      setPending(request)
      return
    }
    setBusy(true)
    setActionError(null)
    if (password !== undefined) setCredentials(password)
    try {
      await request.action(basicHeader(creds))
      if (session !== sessionRef.current) return
      setBusy(false)
      request.onSuccess()
    } catch (err) {
      if (session !== sessionRef.current) return
      setBusy(false)
      if (err instanceof ApiError && err.status === 401) {
        clearCredentials()
        setPending(request)
        setPromptError('Wrong password — try again')
      } else if (err instanceof ApiError && err.status === 503) {
        setActionError(messages.disabled)
      } else {
        setActionError(messages.failed)
      }
    }
  }

  return {
    run(action: (authHeader: string) => Promise<void>, onSuccess: () => void) {
      void attempt({ action, onSuccess })
    },
    busy,
    actionError,
    prompt: {
      open: pending !== null,
      error: promptError,
      onSubmit(password: string) {
        if (pending === null) return
        const request = pending
        setPending(null)
        setPromptError(null)
        void attempt(request, password)
      },
      onCancel() {
        setPending(null)
        setPromptError(null)
      },
    },
    abandon() {
      sessionRef.current += 1
      setPending(null)
      setPromptError(null)
      setActionError(null)
      setBusy(false)
    },
  }
}
