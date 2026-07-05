import type { Sighting } from '../api'

export type SheetState =
  | null
  | { kind: 'log' }
  | { kind: 'day'; date: string }
  | { kind: 'sighting'; id: string; fromDay?: string }

/** A sheet is stale only when it points at a sighting that no longer exists. */
export function sheetIsValid(sheet: SheetState, sightings: Sighting[]): boolean {
  if (sheet === null || sheet.kind !== 'sighting') return true
  return sightings.some((s) => s.id === sheet.id)
}
