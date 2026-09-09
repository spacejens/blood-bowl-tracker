import { serial, text } from 'drizzle-orm/pg-core';

import { historyTrackedTable } from '../history';
import { discordBotUsage } from './pg-schema';

/**
 * A Discord server the bot has been used in.
 *
 * The Discord snowflake is an ordinary unique column rather than the primary
 * key: every table here keeps its own serial `id`, matching the rest of the
 * schema. There is only one external system this data could ever map to, so
 * no separate `*_external_ids` mapping table is needed either.
 */
const guildsTable = historyTrackedTable({
  schema: discordBotUsage,
  name: 'guilds',
  columns: {
    id: serial('id').primaryKey(),
    discordId: text('discord_id').notNull().unique(),
    name: text('name').notNull(),
  },
});

export const guilds = guildsTable.table;
export const guildsHistory = guildsTable.historyTable;

export type Guild = typeof guilds.$inferSelect;
export type NewGuild = typeof guilds.$inferInsert;
