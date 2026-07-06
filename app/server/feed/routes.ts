import { Router } from 'express'
import type { SightingsStore } from '../sightings/store.js'
import { buildFeed } from './buildFeed.js'

const MAX_ITEMS = 50

export function feedRouter(store: SightingsStore, siteUrl: string): Router {
  const router = Router()
  router.get('/feed.xml', async (_req, res) => {
    const sightings = (await store.list()).slice(0, MAX_ITEMS)
    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=300')
    res.send(buildFeed(sightings, siteUrl))
  })
  return router
}
