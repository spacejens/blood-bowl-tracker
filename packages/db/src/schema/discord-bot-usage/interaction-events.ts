import { integer, serial, text, timestamp } from 'drizzle-orm/pg-core';

import { channels } from './channels';
import { guilds } from './guilds';
import { interactionOutcomeEnum, interactionTypes } from './interaction-types';
import { discordBotUsage } from './pg-schema';
import { discordUsers } from './users';

/**
 * One triggered command, button click or select-menu selection: what was
 * triggered, by whom, where, when, and whether the handler succeeded.
 *
 * Only interactions that matched a registered handler get a row. An unmatched
 * one (a button from before a redeploy, say) has no catalog entry to record
 * against, and the bot already ignores it.
 */
export const interactionEvents = discordBotUsage.table('interaction_events', {
  id: serial('id').primaryKey(),
  interactionTypeId: integer('interaction_type_id')
    .references(() => interactionTypes.id)
    .notNull(),
  userId: integer('user_id')
    .references(() => discordUsers.id)
    .notNull(),
  guildId: integer('guild_id').references(() => guilds.id),
  channelId: integer('channel_id')
    .references(() => channels.id)
    .notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  outcome: interactionOutcomeEnum('outcome').notNull(),
  errorMessage: text('error_message'),
});

export type InteractionEvent = typeof interactionEvents.$inferSelect;
export type NewInteractionEvent = typeof interactionEvents.$inferInsert;
