import { and, eq, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '../db/schema.js'
import { sightingLikes } from '../db/schema.js'

export function createLikesStore(db: NodePgDatabase<typeof schema>) {
  return {
    /** Idempotent: the (sightingId, deviceId) unique constraint makes a repeat like a no-op. */
    async like(sightingId: string, deviceId: string): Promise<void> {
      await db.insert(sightingLikes).values({ sightingId, deviceId }).onConflictDoNothing()
    },

    async unlike(sightingId: string, deviceId: string): Promise<void> {
      await db
        .delete(sightingLikes)
        .where(and(eq(sightingLikes.sightingId, sightingId), eq(sightingLikes.deviceId, deviceId)))
    },

    async countFor(sightingId: string): Promise<number> {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(sightingLikes)
        .where(eq(sightingLikes.sightingId, sightingId))
      return row.count
    },
  }
}

export type LikesStore = ReturnType<typeof createLikesStore>
