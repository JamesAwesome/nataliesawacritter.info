import { Router, type RequestHandler } from 'express'
import { UUID_RE, sendValidation } from '../httpValidation.js'
import type { SightingsStore } from '../sightings/store.js'
import type { LikesStore } from './store.js'

/** Public like/unlike. No writeGate by design: likes are the app's one open
 *  write. Correctness comes from the (sighting, device) unique constraint;
 *  velocity from the per-IP limiter passed in. */
export function likesRouter(likes: LikesStore, sightings: SightingsStore, limiter: RequestHandler): Router {
  const router = Router()

  const handler =
    (action: 'like' | 'unlike'): RequestHandler =>
    async (req, res) => {
      const { id } = req.params as { id: string }
      const deviceId = req.get('X-Device-Id')
      const details: Record<string, string> = {}
      if (!UUID_RE.test(id)) details.id = 'must be a uuid'
      if (deviceId === undefined || !UUID_RE.test(deviceId)) details.deviceId = 'X-Device-Id header must be a uuid'
      if (Object.keys(details).length > 0) {
        sendValidation(res, details)
        return
      }
      if ((await sightings.getById(id)) === null) {
        res.status(404).json({ error: 'not found' })
        return
      }
      if (action === 'like') await likes.like(id, deviceId as string)
      else await likes.unlike(id, deviceId as string)
      res.json({ likeCount: await likes.countFor(id) })
    }

  router.post('/:id/like', limiter, handler('like'))
  router.delete('/:id/like', limiter, handler('unlike'))
  return router
}
