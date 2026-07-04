const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Jul 3" — same non-UTC-shifted parsing as formatWhen. */
export function formatDay(sightedOn: string): string {
  const [, month, day] = sightedOn.split('-').map(Number)
  return `${MONTHS[month - 1]} ${day}`
}

/** "Jul 3 · dusk" — sightedOn is YYYY-MM-DD; parsed by split (never Date parsing, which is UTC-shifted). */
export function formatWhen(sightedOn: string, sightedTime: string | null): string {
  return `${formatDay(sightedOn)} · ${sightedTime ?? 'just now'}`
}

const CLOCK_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

/** '14:30' → '2:30 PM'. Non-HH:MM input passes through unchanged. */
export function formatClockTime(hhmm: string): string {
  const match = CLOCK_RE.exec(hhmm)
  if (match === null) return hhmm
  const hour24 = Number(match[1])
  const suffix = hour24 < 12 ? 'AM' : 'PM'
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  return `${hour12}:${match[2]} ${suffix}`
}

/** Current local time as 'HH:MM' (the value shape <input type="time"> uses). */
export function nowClockTime(): string {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}
