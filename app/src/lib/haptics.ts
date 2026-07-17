// A brief tap buzz for a satisfying like. The Web Vibration API is Android/
// Chrome only — iOS Safari has no support — so this is progressive enhancement:
// a real tick where supported, a silent no-op everywhere else.
export function tapFeedback(): void {
  navigator.vibrate?.(15)
}
