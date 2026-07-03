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
