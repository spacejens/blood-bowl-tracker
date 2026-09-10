import { integer, serial, text, unique } from 'drizzle-orm/pg-core';

import { historyTrackedTable } from '../history';
import { guilds } from './guilds';
import { discordBotUsage } from './pg-schema';
import { discordUsers } from './users';

/**
 * One user's membership of one guild, holding the per-guild nickname that
 * `users.username` cannot: the same person shows a different nickname in every
 * server. The unique key is the natural one, `(user_id, guild_id)`, which is
 * also what the writing service upserts on.
 */
const guildMembersTable = historyTrackedTable({
  schema: discordBotUsage,
  name: 'guild_members',
  columns: {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => discordUsers.id)
      .notNull(),
    guildId: integer('guild_id')
      .references(() => guilds.id)
      .notNull(),
    nickname: text('nickname'),
  },
  extraConfig: (t) => ({
    uniqueGuildMember: unique('guild_members_user_guild_unique').on(
      t.userId,
      t.guildId,
    ),
  }),
});

export const guildMembers = guildMembersTable.table;
export const guildMembersHistory = guildMembersTable.historyTable;

export type GuildMember = typeof guildMembers.$inferSelect;
export type NewGuildMember = typeof guildMembers.$inferInsert;
