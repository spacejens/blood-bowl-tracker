import { integer, serial, text, timestamp, unique } from 'drizzle-orm/pg-core';

import { guilds } from './guilds';
import { discordBotUsage } from './pg-schema';
import { discordUsers } from './users';

/**
 * One user's membership of one guild, holding the per-guild nickname that
 * `users.username` cannot: the same person shows a different nickname in every
 * server. The unique key is the natural one, `(user_id, guild_id)`, which is
 * also what the writing service upserts on.
 */
export const guildMembers = discordBotUsage.table(
  'guild_members',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => discordUsers.id)
      .notNull(),
    guildId: integer('guild_id')
      .references(() => guilds.id)
      .notNull(),
    nickname: text('nickname'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique('guild_members_user_guild_unique').on(t.userId, t.guildId)],
);

export type GuildMember = typeof guildMembers.$inferSelect;
export type NewGuildMember = typeof guildMembers.$inferInsert;
