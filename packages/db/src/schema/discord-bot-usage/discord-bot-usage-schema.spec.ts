import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import {
  channels,
  discordUsers,
  guildMembers,
  guilds,
  interactionEventParameters,
  interactionEvents,
  interactionKindEnum,
  interactionOutcomeEnum,
  interactionTypes,
} from '../index';

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

  describe('interaction catalog and events', () => {
    it('exposes the interaction kind and outcome enums', () => {
      expect(interactionKindEnum.enumValues).toEqual([
        'command',
        'button',
        'select_menu',
      ]);
      expect(interactionOutcomeEnum.enumValues).toEqual(['success', 'failure']);
    });

    it('makes interaction_types unique on (kind, name)', () => {
      const config = getTableConfig(interactionTypes);
      expect(config.name).toBe('interaction_types');
      expect(config.schema).toBe('discord_bot_usage');
      const unique = config.uniqueConstraints[0];
      expect(unique).toBeDefined();
      expect(unique.columns.map((c) => c.name)).toEqual(['kind', 'name']);
    });

    it('makes interaction_events.guild_id and error_message nullable and the rest required', () => {
      const config = getTableConfig(interactionEvents);
      const byName = new Map(config.columns.map((c) => [c.name, c]));
      // guild_id is nullable because a DM has no guild; error_message is
      // populated only on a failure row.
      expect(byName.get('guild_id')!.notNull).toBe(false);
      expect(byName.get('error_message')!.notNull).toBe(false);
      for (const name of [
        'interaction_type_id',
        'user_id',
        'channel_id',
        'occurred_at',
        'outcome',
      ]) {
        expect(byName.get(name)!.notNull).toBe(true);
      }
    });

    it('cascades interaction_event_parameters when its event is deleted', () => {
      const config = getTableConfig(interactionEventParameters);
      const fk = config.foreignKeys.find((foreignKey) =>
        foreignKey
          .reference()
          .columns.some((column) => column.name === 'event_id'),
      );
      expect(fk).toBeDefined();
      expect(fk!.onDelete).toBe('cascade');
      expect(fk!.reference().foreignTable).toBe(interactionEvents);
      const byName = new Map(config.columns.map((c) => [c.name, c]));
      expect(byName.get('key')!.notNull).toBe(true);
      // Nullable on purpose: a command option or component value can be absent.
      expect(byName.get('value')!.notNull).toBe(false);
    });
  });
});
