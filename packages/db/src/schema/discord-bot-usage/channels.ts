import { integer, serial, text, timestamp } from 'drizzle-orm/pg-core';

import { guilds } from './guilds';
import { discordBotUsage } from './pg-schema';

/**
 * A channel the bot has been used in. `guild_id` and `name` are both nullable:
 * a DM channel belongs to no guild, and DM channels frequently have no name.
 */
export const channels = discordBotUsage.table('channels', {
  id: serial('id').primaryKey(),
  discordId: text('discord_id').notNull().unique(),
  guildId: integer('guild_id').references(() => guilds.id),
  name: text('name'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Channel = typeof channels.$inferSelect;
export type NewChannel = typeof channels.$inferInsert;
