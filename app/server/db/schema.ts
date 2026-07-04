import { date, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

export const sightings = pgTable('sightings', {
  // uuid (not serial): reads are public, so IDs must not be enumerable
  id: uuid('id').primaryKey().defaultRandom(),
  emoji: text('emoji').notNull(),
  name: text('name'),
  sightedOn: date('sighted_on', { mode: 'string' }).notNull(),
  // free-form per design ("just now" when absent), so text not time
  sightedTime: text('sighted_time'),
  place: text('place'),
  comment: text('comment'),
  photoPath: text('photo_path'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const critterProfiles = pgTable(
  'critter_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    emoji: text('emoji').notNull(),
    name: text('name').notNull(),
    place: text('place'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('critter_profiles_emoji_name_idx').on(table.emoji, table.name)],
)
