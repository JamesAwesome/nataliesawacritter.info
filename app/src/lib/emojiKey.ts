/** Lookup key for a stored emoji token, with the variation selector (U+FE0F)
 *  dropped. Several catalogue emoji carry it — '🐿️', '🕊️', '🕷️', '🐻‍❄️' — and
 *  the `sightings.emoji` column takes arbitrary text, so a row written by
 *  anything but the in-app picker can hold the bare form. Both spellings are
 *  the same critter and must resolve to the same name, noun and leaderboard row.
 *
 *  Mirrored inline in server/collectiveNouns.ts, which stays import-free. */
export function emojiKey(emoji: string): string {
  return emoji.replace(/\uFE0F/g, '')
}
