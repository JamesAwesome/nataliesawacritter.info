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
