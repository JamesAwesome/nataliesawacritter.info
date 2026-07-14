// Emoji pictographs (animals, faces, symbols) and regional indicators (the
// letters that compose flags). Used to keep emoji out of text name fields: the
// critter already carries its own emoji, so its name is for words. Mirrored on
// the server in server/nameField.ts (client/server can't share modules).
const EMOJI_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u

export function hasEmoji(value: string): boolean {
  return EMOJI_RE.test(value)
}
