import { desc, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '../db/schema.js'
import { critterProfiles } from '../db/schema.js'

export type NewProfile = { emoji: string; name: string; place: string | null }
export type Profile = typeof critterProfiles.$inferSelect
export type ProfileCreateResult = { ok: true; row: Profile } | { ok: false; conflict: true }

/** Postgres unique-violation is SQLSTATE 23505; drizzle may wrap the pg error, so walk causes. */
function isUniqueViolation(err: unknown): boolean {
  for (let e = err; typeof e === 'object' && e !== null; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: unknown }).code === '23505') return true
  }
  return false
}

export function createProfilesStore(db: NodePgDatabase<typeof schema>) {
  return {
    async list(): Promise<Profile[]> {
      return db.select().from(critterProfiles).orderBy(desc(critterProfiles.createdAt))
    },

    async create(fields: NewProfile): Promise<ProfileCreateResult> {
      try {
        const [row] = await db.insert(critterProfiles).values(fields).returning()
        return { ok: true, row }
      } catch (err) {
        if (isUniqueViolation(err)) return { ok: false, conflict: true }
        throw err
      }
    },

    async remove(id: string): Promise<boolean> {
      const removed = await db
        .delete(critterProfiles)
        .where(eq(critterProfiles.id, id))
        .returning({ id: critterProfiles.id })
      return removed.length > 0
    },
  }
}

export type ProfilesStore = ReturnType<typeof createProfilesStore>
