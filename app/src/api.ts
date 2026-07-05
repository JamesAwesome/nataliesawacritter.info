export type Sighting = {
  id: string
  emoji: string
  name: string | null
  sightedOn: string
  sightedTime: string | null
  place: string | null
  comment: string | null
  photoPath: string | null
  createdAt: string
}

export type NewSightingInput = {
  emoji: string
  sightedOn: string
  name?: string
  sightedTime?: string
  place?: string
  comment?: string
}

export class ApiError extends Error {
  status: number

  constructor(status: number) {
    super(`API error ${status}`)
    this.status = status
  }
}

export async function listSightings(): Promise<Sighting[]> {
  const res = await fetch('/api/sightings')
  if (!res.ok) throw new ApiError(res.status)
  return (await res.json()) as Sighting[]
}

export async function createSighting(
  fields: NewSightingInput,
  authHeader: string,
): Promise<Sighting> {
  const res = await fetch('/api/sightings', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: authHeader },
    body: JSON.stringify(fields),
  })
  if (!res.ok) throw new ApiError(res.status)
  return (await res.json()) as Sighting
}

export async function deleteSighting(id: string, authHeader: string): Promise<void> {
  const res = await fetch(`/api/sightings/${id}`, {
    method: 'DELETE',
    headers: { authorization: authHeader },
  })
  if (!res.ok) throw new ApiError(res.status)
}

export type Profile = {
  id: string
  emoji: string
  name: string
  place: string | null
  createdAt: string
}

export type NewProfileInput = { emoji: string; name: string; place?: string }

export async function listProfiles(): Promise<Profile[]> {
  const res = await fetch('/api/profiles')
  if (!res.ok) throw new ApiError(res.status)
  return (await res.json()) as Profile[]
}

export async function createProfile(fields: NewProfileInput, authHeader: string): Promise<Profile> {
  const res = await fetch('/api/profiles', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: authHeader },
    body: JSON.stringify(fields),
  })
  if (!res.ok) throw new ApiError(res.status)
  return (await res.json()) as Profile
}

export async function deleteProfile(id: string, authHeader: string): Promise<void> {
  const res = await fetch(`/api/profiles/${id}`, {
    method: 'DELETE',
    headers: { authorization: authHeader },
  })
  if (!res.ok) throw new ApiError(res.status)
}

export async function uploadPhoto(id: string, photo: Blob, authHeader: string): Promise<Sighting> {
  const res = await fetch(`/api/sightings/${id}/photo`, {
    method: 'PUT',
    headers: { 'content-type': 'image/jpeg', authorization: authHeader },
    body: photo,
  })
  if (!res.ok) throw new ApiError(res.status)
  return (await res.json()) as Sighting
}

export async function deletePhoto(id: string, authHeader: string): Promise<void> {
  const res = await fetch(`/api/sightings/${id}/photo`, {
    method: 'DELETE',
    headers: { authorization: authHeader },
  })
  if (!res.ok) throw new ApiError(res.status)
}

export type PushSubscriptionInput = { endpoint: string; keys: { p256dh: string; auth: string } }

/** Returns null when push is disabled server-side (503). */
export async function fetchVapidKey(): Promise<string | null> {
  const res = await fetch('/api/push/vapid-public-key')
  if (res.status === 503) return null
  if (!res.ok) throw new ApiError(res.status)
  return ((await res.json()) as { key: string }).key
}

export async function savePushSubscription(subscription: PushSubscriptionInput): Promise<void> {
  const res = await fetch('/api/push/subscriptions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(subscription),
  })
  if (!res.ok) throw new ApiError(res.status)
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  const res = await fetch('/api/push/subscriptions', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  })
  if (!res.ok) throw new ApiError(res.status)
}
