import { useEffect, useState } from 'react'
import { deletePushSubscription, fetchVapidKey, savePushSubscription } from '../api'
import { needsIosInstall, pushSupported, urlBase64ToUint8Array } from '../lib/push'
import { Sheet } from './Sheet'

type BellState = 'unsupported' | 'ios-install' | 'blocked' | 'off' | 'on'

// Synchronous, side-effect-free classification available at first render — no need to
// wait for an effect for these. Plain `pushSupported()` browsers stay 'unsupported' here;
// the mount effect below flips them to 'on'/'off' once the subscription check resolves.
function initialBellState(): BellState {
  if (needsIosInstall()) return 'ios-install'
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'blocked'
  return 'unsupported'
}

export function NotifyBell() {
  const [state, setState] = useState<BellState>(initialBellState)
  const [note, setNote] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (needsIosInstall() || !pushSupported() || Notification.permission === 'denied') return
    let cancelled = false
    void navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (!cancelled) setState(subscription ? 'on' : 'off')
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  async function subscribe() {
    setBusy(true)
    setNote(null)
    try {
      const key = await fetchVapidKey()
      if (key === null) {
        setState('unsupported') // push disabled server-side: hide the bell
        return
      }
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        if (permission === 'denied') setState('blocked')
        return
      }
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      })
      const json = subscription.toJSON()
      try {
        await savePushSubscription({
          endpoint: json.endpoint as string,
          keys: { p256dh: json.keys?.p256dh as string, auth: json.keys?.auth as string },
        })
      } catch (err) {
        await subscription.unsubscribe() // never show "on" for a sub the server doesn't have
        throw err
      }
      setState('on')
    } catch {
      setNote("Couldn't turn on notifications — try again")
    } finally {
      setBusy(false)
    }
  }

  async function unsubscribe() {
    setBusy(true)
    setNote(null)
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription !== null) {
        await subscription.unsubscribe() // local wins: bell off means no more buzzes
        deletePushSubscription(subscription.endpoint).catch(() => {}) // server prunes on 410 anyway
      }
      setState('off')
    } catch {
      // Local subscription still exists, so 'on' remains truthful — just tell the user.
      setNote("Couldn't turn off notifications — try again")
    } finally {
      setBusy(false)
    }
  }

  function onTap() {
    if (state === 'ios-install') setSheetOpen(true)
    else if (state === 'blocked') setNote('Notifications are blocked for this site in your browser settings.')
    else if (state === 'off') void subscribe()
    else if (state === 'on') void unsubscribe()
  }

  if (state === 'unsupported') return null
  return (
    <div className="notify-bell-wrap">
      <button
        type="button"
        className={state === 'on' ? 'notify-bell notify-bell-on' : 'notify-bell'}
        aria-pressed={state === 'on'}
        aria-label={state === 'on' ? 'Alerts on' : 'Get notified'}
        title={state === 'on' ? 'Alerts on' : 'Get notified'}
        disabled={busy}
        onClick={onTap}
      >
        🔔
      </button>
      {note !== null && <p className="notify-note">{note}</p>}
      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)}>
        <h2 className="notify-sheet-title">Get critter alerts 🔔</h2>
        <ol className="notify-steps">
          <li>Tap the Share button in your browser</li>
          <li>Choose “Add to Home Screen”</li>
          <li>Open the app from your home screen and tap the bell</li>
        </ol>
      </Sheet>
    </div>
  )
}
