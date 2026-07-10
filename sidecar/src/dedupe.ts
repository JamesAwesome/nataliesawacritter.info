export function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}

/** True if a critter with this name already exists (case/space-insensitive), so
 *  the sidecar can skip re-requesting one we already have. */
export function isDuplicate(name: string, existingNames: readonly string[]): boolean {
  const n = normalizeName(name)
  return existingNames.some((e) => normalizeName(e) === n)
}
