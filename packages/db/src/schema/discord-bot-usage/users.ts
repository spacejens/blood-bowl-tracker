import { serial, text } from 'drizzle-orm/pg-core';

import { historyTrackedTable } from '../history';
import { discordBotUsage } from './pg-schema';

/**
 * A Discord user who has triggered the bot. `username` is the global Discord
 * username; a per-server nickname lives on `guild_members` instead, since it
 * differs per server.
 *
 * Exported as `discordUsers` because `packages/db`'s barrel is flat and a bare
 * `users` would read like a game-data entity at call sites. The table itself
 * is `discord_bot_usage.users`.
 */
const usersTable = historyTrackedTable({
  schema: discordBotUsage,
  name: 'users',
  columns: {
    id: serial('id').primaryKey(),
    discordId: text('discord_id').notNull().unique(),
    username: text('username').notNull(),
  },
});

export const discordUsers = usersTable.table;
export const discordUsersHistory = usersTable.historyTable;

export type DiscordUser = typeof discordUsers.$inferSelect;
export type NewDiscordUser = typeof discordUsers.$inferInsert;
