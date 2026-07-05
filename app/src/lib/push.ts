/** Decode a base64url VAPID key into the bytes PushManager.subscribe expects. */
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (char) => char.charCodeAt(0))
}

/** iPhone/iPad Safari outside an installed PWA: push only exists after Add to Home Screen. */
export function needsIosInstall(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) && !('PushManager' in window)
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}
