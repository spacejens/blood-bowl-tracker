import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { channels, discordUsers, guildMembers, guilds } from '../index';

describe('discord_bot_usage schema', () => {
  it('puts guilds in the discord_bot_usage schema with a unique discord_id', () => {
    const config = getTableConfig(guilds);
    expect(config.name).toBe('guilds');
    expect(config.schema).toBe('discord_bot_usage');
    const byName = new Map(config.columns.map((c) => [c.name, c]));
    expect(byName.get('discord_id')!.notNull).toBe(true);
    expect(byName.get('discord_id')!.isUnique).toBe(true);
    expect(byName.get('name')!.notNull).toBe(true);
    expect(byName.get('updated_at')!.notNull).toBe(true);
  });

  it('makes channels.guild_id and channels.name nullable', () => {
    // Nullable on purpose: a DM channel belongs to no guild and often has no
    // name at all.
    const config = getTableConfig(channels);
    expect(config.schema).toBe('discord_bot_usage');
    const byName = new Map(config.columns.map((c) => [c.name, c]));
    expect(byName.get('guild_id')!.notNull).toBe(false);
    expect(byName.get('name')!.notNull).toBe(false);
    expect(byName.get('discord_id')!.notNull).toBe(true);
    expect(byName.get('discord_id')!.isUnique).toBe(true);
  });

  it('names the users table "users" inside discord_bot_usage', () => {
    const config = getTableConfig(discordUsers);
    expect(config.name).toBe('users');
    expect(config.schema).toBe('discord_bot_usage');
    const byName = new Map(config.columns.map((c) => [c.name, c]));
    expect(byName.get('username')!.notNull).toBe(true);
    expect(byName.get('discord_id')!.isUnique).toBe(true);
  });

  it('makes guild_members unique on (user_id, guild_id) with a nullable nickname', () => {
    const config = getTableConfig(guildMembers);
    expect(config.schema).toBe('discord_bot_usage');
    const unique = config.uniqueConstraints[0];
    expect(unique).toBeDefined();
    expect(unique.columns.map((c) => c.name)).toEqual(['user_id', 'guild_id']);
    const byName = new Map(config.columns.map((c) => [c.name, c]));
    expect(byName.get('nickname')!.notNull).toBe(false);
    expect(byName.get('user_id')!.notNull).toBe(true);
    expect(byName.get('guild_id')!.notNull).toBe(true);
  });

  it('does not history-track any discord_bot_usage table', () => {
    // Guild/channel/user names are Discord display metadata, overwritten in
    // place; there is no value in versioning them.
    for (const table of [guilds, channels, discordUsers, guildMembers]) {
      const columnNames = getTableConfig(table).columns.map((c) => c.name);
      expect(columnNames).not.toContain('history_version');
      expect(columnNames).not.toContain('history_period');
    }
  });
});
