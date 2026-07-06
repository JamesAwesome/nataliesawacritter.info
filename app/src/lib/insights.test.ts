import { describe, expect, it } from 'vitest'
import { makeSighting } from '../test/helpers'
import { filterByRange, leaderboard, recentEmoji } from './insights'

describe('filterByRange', () => {
  const rows = [
    makeSighting({ id: 'a', sightedOn: '2026-07-01' }),
    makeSighting({ id: 'b', sightedOn: '2026-07-15' }),
    makeSighting({ id: 'c', sightedOn: '2026-07-31' }),
  ]

  it('returns everything when both bounds are empty', () => {
    expect(filterByRange(rows).map((s) => s.id)).toEqual(['a', 'b', 'c'])
    expect(filterByRange(rows, '', '').map((s) => s.id)).toEqual(['a', 'b', 'c'])
  })

  it('is inclusive on both bounds', () => {
    expect(filterByRange(rows, '2026-07-15', '2026-07-31').map((s) => s.id)).toEqual(['b', 'c'])
    expect(filterByRange(rows, '2026-07-01', '2026-07-15').map((s) => s.id)).toEqual(['a', 'b'])
  })

  it('supports open-ended bounds', () => {
    expect(filterByRange(rows, '2026-07-15').map((s) => s.id)).toEqual(['b', 'c'])
    expect(filterByRange(rows, undefined, '2026-07-01').map((s) => s.id)).toEqual(['a'])
  })

  it('preserves input order and can exclude everything', () => {
    expect(filterByRange(rows, '2026-08-01')).toEqual([])
    expect(filterByRange([])).toEqual([])
  })
})

describe('leaderboard', () => {
  it('counts by emoji for unnamed sightings, descending', () => {
    const rows = [
      makeSighting({ emoji: '🦊', name: null }),
      makeSighting({ emoji: '🦊', name: null }),
      makeSighting({ emoji: '🦉', name: null }),
    ]
    expect(leaderboard(rows)).toEqual([
      { emoji: '🦊', name: null, count: 2 },
      { emoji: '🦉', name: null, count: 1 },
    ])
  })

  it('counts the same emoji under different names separately', () => {
    const rows = [
      makeSighting({ emoji: '🐦', name: 'Cardinal' }),
      makeSighting({ emoji: '🐦', name: 'Cardinal' }),
      makeSighting({ emoji: '🐦', name: 'Blue Jay' }),
    ]
    expect(leaderboard(rows)).toEqual([
      { emoji: '🐦', name: 'Cardinal', count: 2 },
      { emoji: '🐦', name: 'Blue Jay', count: 1 },
    ])
  })

  it('merges names case-insensitively', () => {
    const rows = [
      makeSighting({ emoji: '🐦', name: 'Cardinal' }),
      makeSighting({ emoji: '🐦', name: 'cardinal' }),
      makeSighting({ emoji: '🐦', name: '  CARDINAL  ' }),
    ]
    const result = leaderboard(rows)
    expect(result).toHaveLength(1)
    expect(result[0].count).toBe(3)
    expect(result[0].emoji).toBe('🐦')
  })

  it('groups unnamed sightings by emoji with a null name', () => {
    const rows = [
      makeSighting({ emoji: '🐦', name: null }),
      makeSighting({ emoji: '🐦', name: 'Cardinal' }),
    ]
    expect(leaderboard(rows)).toEqual([
      { emoji: '🐦', name: null, count: 1 },
      { emoji: '🐦', name: 'Cardinal', count: 1 },
    ])
  })

  it("uses the most-recent sighting's casing as the display name", () => {
    const rows = [
      makeSighting({ emoji: '🐦', name: 'cardinal', createdAt: '2026-07-01T00:00:00.000Z' }),
      makeSighting({ emoji: '🐦', name: 'Cardinal', createdAt: '2026-07-05T00:00:00.000Z' }),
    ]
    expect(leaderboard(rows)[0].name).toBe('Cardinal')
  })

  it('breaks a full tie (count, latest, emoji) by name ascending', () => {
    const rows = [
      makeSighting({ emoji: '🐦', name: 'Cardinal', createdAt: '2026-07-05T00:00:00.000Z' }),
      makeSighting({ emoji: '🐦', name: 'Blue Jay', createdAt: '2026-07-05T00:00:00.000Z' }),
    ]
    expect(leaderboard(rows).map((r) => r.name)).toEqual(['Blue Jay', 'Cardinal'])
  })

  it('breaks count ties by most-recent sighting, then codepoint', () => {
    const rows = [
      makeSighting({ emoji: '🐸', createdAt: '2026-07-01T00:00:00.000Z' }),
      makeSighting({ emoji: '🦆', createdAt: '2026-07-05T00:00:00.000Z' }),
      makeSighting({ emoji: '🐢', createdAt: '2026-07-05T00:00:00.000Z' }),
    ]
    // all count 1: 🦆 and 🐢 share the latest createdAt → codepoint tiebreak (🐢 U+1F422 < 🦆 U+1F986); 🐸 oldest last
    expect(leaderboard(rows).map((r) => r.emoji)).toEqual(['🐢', '🦆', '🐸'])
  })

  it('tiebreaks by codepoint order, not UTF-16 units', () => {
    const rows = leaderboard([
      makeSighting({ emoji: '😀', createdAt: '2026-07-01T00:00:00.000Z' }),
      makeSighting({ emoji: '�', createdAt: '2026-07-01T00:00:00.000Z' }),
    ])
    expect(rows.map((r) => r.emoji)).toEqual(['�', '😀'])
  })

  it('is empty for no sightings', () => {
    expect(leaderboard([])).toEqual([])
  })
})

describe('recentEmoji', () => {
  it('returns distinct emoji by most-recent createdAt, up to the limit', () => {
    const rows = [
      makeSighting({ emoji: '🦊', createdAt: '2026-07-01T00:00:00.000Z' }),
      makeSighting({ emoji: '🦉', createdAt: '2026-07-03T00:00:00.000Z' }),
      makeSighting({ emoji: '🦊', createdAt: '2026-07-05T00:00:00.000Z' }),
      makeSighting({ emoji: '🐸', createdAt: '2026-07-02T00:00:00.000Z' }),
    ]
    expect(recentEmoji(rows, 6)).toEqual(['🦊', '🦉', '🐸'])
  })

  it('respects the limit and handles a back-dated sighting logged most recently', () => {
    const rows = [
      makeSighting({ emoji: '🦌', sightedOn: '2020-01-01', createdAt: '2026-07-09T00:00:00.000Z' }),
      makeSighting({ emoji: '🦉', createdAt: '2026-07-08T00:00:00.000Z' }),
      makeSighting({ emoji: '🐢', createdAt: '2026-07-07T00:00:00.000Z' }),
    ]
    // ordered by createdAt (when logged), NOT sightedOn → 🦌 first despite its old date
    expect(recentEmoji(rows, 2)).toEqual(['🦌', '🦉'])
    expect(recentEmoji([], 6)).toEqual([])
  })

  it('returns empty for a non-positive limit', () => {
    expect(recentEmoji([makeSighting({ emoji: '🦊' })], 0)).toEqual([])
  })
})
