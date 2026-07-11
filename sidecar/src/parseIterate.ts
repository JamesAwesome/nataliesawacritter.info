/** Extracts the feedback from an `/iterate <feedback>` PR comment, or null if
 *  the comment isn't an iterate command. Only a comment whose (trimmed) body
 *  *begins* with the `/iterate` token fires — casual chatter ("lgtm", "…please
 *  /iterate later") must not spend tokens. `/iterate` with no feedback → null. */
export function parseIterate(body: string): string | null {
  const m = /^\/iterate\b[ \t]*([\s\S]*)$/i.exec(body.trim())
  if (!m) return null
  const feedback = m[1].trim()
  return feedback === '' ? null : feedback
}
