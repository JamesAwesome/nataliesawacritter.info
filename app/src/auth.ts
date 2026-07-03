const STORAGE_KEY = 'critter-write-auth'
const USER = 'natalie'

export type Credentials = { user: string; password: string }

export function getCredentials(): Credentials | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw === null) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === 'object' && parsed !== null &&
      'user' in parsed && typeof parsed.user === 'string' &&
      'password' in parsed && typeof parsed.password === 'string'
    ) {
      return { user: parsed.user, password: parsed.password }
    }
  } catch {
    // corrupt storage — treat as absent
  }
  return null
}

export function setCredentials(password: string): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ user: USER, password }))
}

export function clearCredentials(): void {
  localStorage.removeItem(STORAGE_KEY)
}

function toBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function basicHeader(creds: Credentials): string {
  return 'Basic ' + toBase64Utf8(`${creds.user}:${creds.password}`)
}
