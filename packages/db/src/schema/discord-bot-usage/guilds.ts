import { serial, text, timestamp } from 'drizzle-orm/pg-core';

import { discordBotUsage } from './pg-schema';

/**
 * A Discord server the bot has been used in.
 *
 * The Discord snowflake is an ordinary unique column rather than the primary
 * key: every table here keeps its own serial `id`, matching the rest of the
 * schema. There is only one external system this data could ever map to, so
 * no separate `*_external_ids` mapping table is needed either.
 *
 * `updated_at` is maintained by the writing service, not by the
 * `set_updated_at` trigger — that trigger is installed only for
 * history-tracked tables, and none of these are.
 */
export const guilds = discordBotUsage.table('guilds', {
  id: serial('id').primaryKey(),
  discordId: text('discord_id').notNull().unique(),
  name: text('name').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Guild = typeof guilds.$inferSelect;
export type NewGuild = typeof guilds.$inferInsert;
