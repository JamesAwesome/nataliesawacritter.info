import { and, desc, eq, getTableColumns, gte, lte, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '../db/schema.js'
import { sightingLikes, sightings } from '../db/schema.js'
import type { Quantity } from '../quantity.js'

export type NewSighting = {
  emoji: string
  sightedOn: string
  name: string | null
  sightedTime: string | null
  place: string | null
  comment: string | null
  quantity: Quantity
}

export type Sighting = typeof sightings.$inferSelect
/** A sighting as the read API serves it: row + derived like count. */
export type SightingWithLikes = Sighting & { likeCount: number }

export function createSightingsStore(db: NodePgDatabase<typeof schema>) {
  return {
    async list(range: { from?: string; to?: string } = {}): Promise<SightingWithLikes[]> {
      const conditions = []
      if (range.from !== undefined) conditions.push(gte(sightings.sightedOn, range.from))
      if (range.to !== undefined) conditions.push(lte(sightings.sightedOn, range.to))
      // Derived count (spike-validated): the (sighting_id, device_id) unique index
      // serves the GROUP BY; no denormalized counter to drift.
      return db
        .select({ ...getTableColumns(sightings), likeCount: sql<number>`count(${sightingLikes.id})::int` })
        .from(sightings)
        .leftJoin(sightingLikes, eq(sightingLikes.sightingId, sightings.id))
        .where(conditions.length ? and(...conditions) : undefined)
        .groupBy(sightings.id)
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

    async getById(id: string): Promise<Sighting | null> {
      const [row] = await db.select().from(sightings).where(eq(sightings.id, id))
      return row ?? null
    },

    async setPhotoPath(id: string, photoPath: string | null): Promise<Sighting | null> {
      const [row] = await db
        .update(sightings)
        .set({ photoPath })
        .where(eq(sightings.id, id))
        .returning()
      return row ?? null
    },
  }
}

export type SightingsStore = ReturnType<typeof createSightingsStore>
