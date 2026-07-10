import { desc, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '../db/schema.js'
import { emojiRequests } from '../db/schema.js'

export type NewEmojiRequest = { name: string; note: string | null }
export type EmojiRequest = typeof emojiRequests.$inferSelect

export function createEmojiRequestsStore(db: NodePgDatabase<typeof schema>) {
  return {
    async list(): Promise<EmojiRequest[]> {
      return db.select().from(emojiRequests).orderBy(desc(emojiRequests.createdAt))
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
