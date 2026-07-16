import type { Sighting } from '../sightings/store.js'

/** Photos upload in a separate request right after the sighting is created, so
 *  the create-time notification would never carry the photo. This holds the
 *  notification for a sighting whose client said a photo is coming, and fires it
 *  when the photo attaches — so the push includes the image. A create with no
 *  photo notifies immediately; a photo attached to a sighting that wasn't
 *  awaiting one (the add-photo-later recovery path on an already-notified
 *  sighting) does not re-notify.
 *
 *  Single-process app: the pending set lives in memory. A photo-intended
 *  sighting whose upload never lands leaks one id and gets no push — rare, and
 *  the sighting is still logged and visible. */
export function createSightingNotify(notifySighting: (sighting: Sighting) => void) {
  const awaitingPhoto = new Set<string>()
  return {
    onCreated(sighting: Sighting, hasPhoto: boolean): void {
      if (hasPhoto) awaitingPhoto.add(sighting.id)
      else notifySighting(sighting)
    },
    onPhotoAttached(sighting: Sighting): void {
      if (awaitingPhoto.delete(sighting.id)) notifySighting(sighting)
    },
  }
}
