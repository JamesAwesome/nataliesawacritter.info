/** Mask credentials embedded in a URL (e.g. the tokenized git remote
 *  `https://x-access-token:<PAT>@github.com` or `user:pass@host`) so a child
 *  process's stderr can't leak the PAT / write password into the sidecar's
 *  logs. Defense-in-depth — the sidecar should never print its secrets. */
export function redact(text: string): string {
  return text.replace(/(https?:\/\/)[^/@\s]+@/gi, '$1***@')
}
