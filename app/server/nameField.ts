// Emoji pictographs and regional indicators (the letters that compose flags).
// Text name fields (sighting name, friend name) must not carry emoji — the
// critter already has an emoji field. The client blocks this for UX; this is
// the server gate (fail closed). Mirrored on the client in src/lib/hasEmoji.ts
// (client/server can't share modules).
const EMOJI_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u

export function hasEmoji(value: string): boolean {
  return EMOJI_RE.test(value)
}
