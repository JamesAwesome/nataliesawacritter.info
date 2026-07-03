import { and, desc, eq, gte, lte } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '../db/schema.js'
import { sightings } from '../db/schema.js'

export type NewSighting = {
  emoji: string
  sightedOn: string
  name: string | null
  sightedTime: string | null
  place: string | null
  comment: string | null
}

export type Sighting = typeof sightings.$inferSelect

export function createSightingsStore(db: NodePgDatabase<typeof schema>) {
  return {
    async list(range: { from?: string; to?: string } = {}): Promise<Sighting[]> {
      const conditions = []
      if (range.from !== undefined) conditions.push(gte(sightings.sightedOn, range.from))
      if (range.to !== undefined) conditions.push(lte(sightings.sightedOn, range.to))
      return db
        .select()
        .from(sightings)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(sightings.sightedOn), desc(sightings.createdAt))
    },

    async create(fields: NewSighting): Promise<Sighting> {
      const [row] = await db.insert(sightings).values(fields).returning()
      return row
    },

    async remove(id: string): Promise<boolean> {
      const removed = await db
        .delete(sightings)
        .where(eq(sightings.id, id))
        .returning({ id: sightings.id })
      return removed.length > 0
    },
  }
}

export type SightingsStore = ReturnType<typeof createSightingsStore>
