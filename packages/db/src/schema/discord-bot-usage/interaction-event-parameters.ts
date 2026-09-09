import { integer, serial, text, timestamp } from 'drizzle-orm/pg-core';

import { interactionEvents } from './interaction-events';
import { discordBotUsage } from './pg-schema';

/**
 * What the interaction carried: one row per slash-command option, and for
 * components the dynamic remainder of the customId after the matched prefix
 * (`key: 'id'`) plus one row per selected value of a select menu
 * (`key: 'value'`).
 *
 * Cascade-deleted with its event: a parameter row has no meaning without the
 * event it describes.
 */
export const interactionEventParameters = discordBotUsage.table(
  'interaction_event_parameters',
  {
    id: serial('id').primaryKey(),
    eventId: integer('event_id')
      .references(() => interactionEvents.id, { onDelete: 'cascade' })
      .notNull(),
    key: text('key').notNull(),
    value: text('value'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export type InteractionEventParameter =
  typeof interactionEventParameters.$inferSelect;
export type NewInteractionEventParameter =
  typeof interactionEventParameters.$inferInsert;
