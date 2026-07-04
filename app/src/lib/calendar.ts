import type { Sighting } from '../api'

export type CalendarCell = {
  date: string
  dayOfMonth: number
  inMonth: boolean
  isToday: boolean
  sightings: Sighting[]
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function toDateString(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

/** 42 cells (6 weeks) starting the Sunday on or before the 1st. month is 1-12. */
export function monthGrid(
  year: number,
  month: number,
  sightings: Sighting[],
  today: string,
): CalendarCell[] {
  const byDay = new Map<string, Sighting[]>()
  for (const s of sightings) {
    const list = byDay.get(s.sightedOn)
    if (list === undefined) byDay.set(s.sightedOn, [s])
    else list.push(s)
  }
  const first = new Date(year, month - 1, 1)
  const startOffset = first.getDay()
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(year, month - 1, 1 - startOffset + i)
    const date = toDateString(d)
    const inMonth = d.getMonth() === month - 1
    return {
      date,
      dayOfMonth: d.getDate(),
      inMonth,
      isToday: inMonth && date === today,
      sightings: byDay.get(date) ?? [],
    }
  })
}

export function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`
}

export function addMonths(year: number, month: number, delta: 1 | -1): { year: number; month: number } {
  const zeroBased = month - 1 + delta
  const newYear = year + Math.floor(zeroBased / 12)
  return { year: newYear, month: ((zeroBased % 12) + 12) % 12 + 1 }
}

export function currentYearMonth(): { year: number; month: number } {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

export function todayString(): string {
  return toDateString(new Date())
}
