import { eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '../db/schema.js'
import { pushSubscriptions } from '../db/schema.js'

export type NewSubscription = { endpoint: string; p256dh: string; auth: string }
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect

export function createPushStore(db: NodePgDatabase<typeof schema>) {
  return {
    async upsert(fields: NewSubscription): Promise<void> {
      await db
        .insert(pushSubscriptions)
        .values(fields)
        .onConflictDoUpdate({
          target: pushSubscriptions.endpoint,
          set: { p256dh: fields.p256dh, auth: fields.auth },
        })
    },

    async removeByEndpoint(endpoint: string): Promise<boolean> {
      const removed = await db
        .delete(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, endpoint))
        .returning({ id: pushSubscriptions.id })
      return removed.length > 0
    },

    async listAll(): Promise<PushSubscriptionRow[]> {
      return db.select().from(pushSubscriptions)
    },
  }
}

export type PushStore = ReturnType<typeof createPushStore>
