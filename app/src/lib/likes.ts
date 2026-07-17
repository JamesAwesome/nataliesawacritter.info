// The visitor's like identity and memory. The server owns counts (deduped by
// device); this browser owns "which sightings did *I* like" — keeping the
// public GET uniform and cacheable. See the sighting-likes design spec.
const DEVICE_KEY = 'nac-device-id'
const LIKED_KEY = 'nac-liked'

export function deviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY)
  if (id === null) {
    id = crypto.randomUUID()
    localStorage.setItem(DEVICE_KEY, id)
  }
  return id
}

function likedSet(): Set<string> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(LIKED_KEY) ?? '[]')
    return new Set(Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : [])
  } catch {
    return new Set()
  }
}

function save(set: Set<string>): void {
  localStorage.setItem(LIKED_KEY, JSON.stringify([...set]))
}

export function hasLiked(id: string): boolean {
  return likedSet().has(id)
}

export function markLiked(id: string): void {
  const set = likedSet()
  set.add(id)
  save(set)
}

export function markUnliked(id: string): void {
  const set = likedSet()
  set.delete(id)
  save(set)
}
