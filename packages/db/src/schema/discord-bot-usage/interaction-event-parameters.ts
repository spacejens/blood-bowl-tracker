import { integer, serial, text } from 'drizzle-orm/pg-core';

import { historyTrackedTable } from '../history';
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
const interactionEventParametersTable = historyTrackedTable({
  schema: discordBotUsage,
  name: 'interaction_event_parameters',
  columns: {
    id: serial('id').primaryKey(),
    eventId: integer('event_id')
      .references(() => interactionEvents.id, { onDelete: 'cascade' })
      .notNull(),
    key: text('key').notNull(),
    value: text('value'),
  },
});

export const interactionEventParameters = interactionEventParametersTable.table;
export const interactionEventParametersHistory =
  interactionEventParametersTable.historyTable;

export type InteractionEventParameter =
  typeof interactionEventParameters.$inferSelect;
export type NewInteractionEventParameter =
  typeof interactionEventParameters.$inferInsert;
