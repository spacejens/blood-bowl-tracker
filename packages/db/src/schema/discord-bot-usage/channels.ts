import { integer, serial, text } from 'drizzle-orm/pg-core';

import { historyTrackedTable } from '../history';
import { guilds } from './guilds';
import { discordBotUsage } from './pg-schema';

/**
 * A channel the bot has been used in. `guild_id` and `name` are both nullable:
 * a DM channel belongs to no guild, and DM channels frequently have no name.
 */
const channelsTable = historyTrackedTable({
  schema: discordBotUsage,
  name: 'channels',
  columns: {
    id: serial('id').primaryKey(),
    discordId: text('discord_id').notNull().unique(),
    guildId: integer('guild_id').references(() => guilds.id),
    name: text('name'),
  },
});

export const channels = channelsTable.table;
export const channelsHistory = channelsTable.historyTable;

export type Channel = typeof channels.$inferSelect;
export type NewChannel = typeof channels.$inferInsert;
