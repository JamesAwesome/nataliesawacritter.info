import { desc, eq, isNull } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '../db/schema.js'
import { emojiRequests } from '../db/schema.js'
import type { Outcome } from './outcome.js'

export type NewEmojiRequest = { name: string; note: string | null }
export type EmojiRequest = typeof emojiRequests.$inferSelect

export function createEmojiRequestsStore(db: NodePgDatabase<typeof schema>) {
  return {
    /** All requests newest-first, or only unhandled ones (for the sidecar). */
    async list(opts: { pending?: boolean } = {}): Promise<EmojiRequest[]> {
      return db
        .select()
        .from(emojiRequests)
        .where(opts.pending ? isNull(emojiRequests.handledAt) : undefined)
        .orderBy(desc(emojiRequests.createdAt))
    },

    /** Marks a request resolved (sidecar). Returns the row, or null if missing. */
    async markHandled(id: string, fields: { prUrl: string | null; outcome: Outcome }): Promise<EmojiRequest | null> {
      const [row] = await db
        .update(emojiRequests)
        .set({ handledAt: new Date(), prUrl: fields.prUrl, outcome: fields.outcome })
        .where(eq(emojiRequests.id, id))
        .returning()
      return row ?? null
    },

    async create(fields: NewEmojiRequest): Promise<EmojiRequest> {
      const [row] = await db.insert(emojiRequests).values(fields).returning()
      return row
    },

    async remove(id: string): Promise<boolean> {
      const removed = await db
        .delete(emojiRequests)
        .where(eq(emojiRequests.id, id))
        .returning({ id: emojiRequests.id })
      return removed.length > 0
    },
  }
}

export type EmojiRequestsStore = ReturnType<typeof createEmojiRequestsStore>
