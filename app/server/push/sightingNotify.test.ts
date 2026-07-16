import { describe, expect, it, vi } from 'vitest'
import type { Sighting } from '../sightings/store.js'
import { createSightingNotify } from './sightingNotify.js'

function sighting(overrides: Partial<Sighting> = {}): Sighting {
  return {
    id: '3f9a26cc-1c0e-4c3a-9b52-08a1c2f4d9aa',
    emoji: '🦝',
    name: null,
    sightedOn: '2026-07-05',
    sightedTime: null,
    place: null,
    comment: null,
    quantity: '1',
    photoPath: null,
    createdAt: new Date('2026-07-05T12:00:00Z'),
    ...overrides,
  }
}

describe('createSightingNotify', () => {
  it('notifies immediately on create when no photo is coming', () => {
    const notify = vi.fn()
    const s = sighting()
    createSightingNotify(notify).onCreated(s, false)
    expect(notify).toHaveBeenCalledWith(s)
  })

  it('defers the notification when a photo is coming, then fires it on attach', () => {
    const notify = vi.fn()
    const { onCreated, onPhotoAttached } = createSightingNotify(notify)
    const created = sighting()
    onCreated(created, true)
    expect(notify).not.toHaveBeenCalled() // held until the photo lands

    const withPhoto = sighting({ photoPath: '/api/photos/abc.jpg' })
    onPhotoAttached(withPhoto)
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith(withPhoto)
  })

  it('does not notify on a photo attach that was not a deferred create (add-photo-later)', () => {
    const notify = vi.fn()
    const { onPhotoAttached } = createSightingNotify(notify)
    onPhotoAttached(sighting({ photoPath: '/api/photos/abc.jpg' }))
    expect(notify).not.toHaveBeenCalled()
  })

  it('fires only once even if the photo is attached twice (retry after a failed upload)', () => {
    const notify = vi.fn()
    const { onCreated, onPhotoAttached } = createSightingNotify(notify)
    onCreated(sighting(), true)
    onPhotoAttached(sighting({ photoPath: '/api/photos/a.jpg' }))
    onPhotoAttached(sighting({ photoPath: '/api/photos/a.jpg' }))
    expect(notify).toHaveBeenCalledTimes(1)
  })
})
