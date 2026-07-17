import { date, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import type { Quantity } from '../quantity.js'
import type { Outcome } from '../emojiRequests/outcome.js'

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
  // Bucketed count: '1' | '2' | '3' | 'many' (see server/quantity.ts). Stored raw,
  // formatted at the edge; '1' is the default and renders no badge.
  quantity: text('quantity').$type<Quantity>().notNull().default('1'),
  photoPath: text('photo_path'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const critterProfiles = pgTable('critter_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  emoji: text('emoji').notNull(),
  name: text('name').notNull(),
  place: text('place'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const emojiRequests = pgTable('emoji_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  // The critter/emoji being asked for, plus optional details. Owner-only list
  // (writes and reads both gated), so no public projection needed.
  name: text('name').notNull(),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  // Set by the sidecar once it acts on the request. handledAt null = pending.
  handledAt: timestamp('handled_at', { withTimezone: true }),
  prUrl: text('pr_url'),
  outcome: text('outcome').$type<Outcome>(),
})

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Unique: re-subscribing from the same browser upserts, never duplicates.
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const sightingLikes = pgTable(
  'sighting_likes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sightingId: uuid('sighting_id')
      .notNull()
      .references(() => sightings.id, { onDelete: 'cascade' }),
    // Anonymous per-browser id (client-generated UUID) — dedup key, never PII.
    deviceId: text('device_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // sighting_id leads, so this unique index also serves COUNT ... GROUP BY sighting_id.
  (t) => ({ uniqDeviceSighting: unique('sighting_likes_sighting_device').on(t.sightingId, t.deviceId) }),
)
