import type { Sighting } from '../api'

/** Inclusive on both bounds; empty/undefined bound = open. Preserves input order. */
export function filterByRange(sightings: Sighting[], from?: string, to?: string): Sighting[] {
  return sightings.filter((s) => {
    if (from && s.sightedOn < from) return false
    if (to && s.sightedOn > to) return false
    return true
  })
}

export type LeaderRow = { emoji: string; count: number }

/** count desc, then that emoji's most-recent createdAt desc, then emoji codepoint asc. */
export function leaderboard(sightings: Sighting[]): LeaderRow[] {
  const groups = new Map<string, { count: number; latest: string }>()
  for (const s of sightings) {
    const g = groups.get(s.emoji)
    if (g === undefined) groups.set(s.emoji, { count: 1, latest: s.createdAt })
    else {
      g.count += 1
      if (s.createdAt > g.latest) g.latest = s.createdAt
    }
  }
  return [...groups.entries()]
    .map(([emoji, g]) => ({ emoji, ...g }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        (a.latest < b.latest ? 1 : a.latest > b.latest ? -1 : 0) ||
        (a.emoji < b.emoji ? -1 : a.emoji > b.emoji ? 1 : 0),
    )
    .map(({ emoji, count }) => ({ emoji, count }))
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
