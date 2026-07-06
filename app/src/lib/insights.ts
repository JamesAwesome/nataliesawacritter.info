import type { Sighting } from '../api'
import { normalizedName } from './critters'

/** Inclusive on both bounds; empty/undefined bound = open. Preserves input order. */
export function filterByRange(sightings: Sighting[], from?: string, to?: string): Sighting[] {
  return sightings.filter((s) => {
    if (from && s.sightedOn < from) return false
    if (to && s.sightedOn > to) return false
    return true
  })
}

export type LeaderRow = { emoji: string; name: string | null; count: number }

/** Deterministic, locale-free emoji order: full codepoint sequences. */
function compareEmoji(a: string, b: string): number {
  const as = Array.from(a)
  const bs = Array.from(b)
  for (let i = 0; i < Math.min(as.length, bs.length); i += 1) {
    const diff = (as[i].codePointAt(0) ?? 0) - (bs[i].codePointAt(0) ?? 0)
    if (diff !== 0) return diff
  }
  return as.length - bs.length
}

/** Groups by (emoji, case-insensitive name); unnamed sightings group by emoji
 *  with a null name. Sort: count desc, then that group's most-recent createdAt
 *  desc, then emoji codepoint asc, then display name asc. Display name follows
 *  the most-recent sighting's casing. */
export function leaderboard(sightings: Sighting[]): LeaderRow[] {
  const groups = new Map<string, { emoji: string; name: string | null; count: number; latest: string }>()
  for (const s of sightings) {
    const norm = normalizedName(s.name ?? '')
    const key = `${s.emoji} ${norm}`
    const display = norm === '' ? null : s.name
    const g = groups.get(key)
    if (g === undefined) {
      groups.set(key, { emoji: s.emoji, name: display, count: 1, latest: s.createdAt })
    } else {
      g.count += 1
      if (s.createdAt > g.latest) {
        g.latest = s.createdAt
        g.name = display // display name follows the most-recent sighting's casing
      }
    }
  }
  return [...groups.values()]
    .sort(
      (a, b) =>
        b.count - a.count ||
        (a.latest < b.latest ? 1 : a.latest > b.latest ? -1 : 0) ||
        compareEmoji(a.emoji, b.emoji) ||
        ((a.name ?? '') < (b.name ?? '') ? -1 : (a.name ?? '') > (b.name ?? '') ? 1 : 0),
    )
    .map(({ emoji, name, count }) => ({ emoji, name, count }))
}

/** Distinct emoji ordered by most-recent createdAt, first `limit` kept. */
export function recentEmoji(sightings: Sighting[], limit: number): string[] {
  if (limit <= 0) return []
  const byRecency = [...sightings].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
  )
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of byRecency) {
    if (seen.has(s.emoji)) continue
    seen.add(s.emoji)
    out.push(s.emoji)
    if (out.length >= limit) break
  }
  return out
}
