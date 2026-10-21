import { Test } from '@nestjs/testing';
import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
} from 'discord.js';
import { beforeEach, describe, expect, it } from 'vitest';

import type { HandledInteractionOptions } from './handled-interaction-builder.service';
import { HandledInteractionBuilderService } from './handled-interaction-builder.service';

const OCCURRED_AT = new Date('2026-10-20T12:00:00.000Z');

/** A fake slash-command interaction exposing only what the builder reads. */
function commandInteraction(
  overrides: Record<string, unknown> = {},
): ChatInputCommandInteraction {
  return {
    commandName: 'stats',
    createdAt: OCCURRED_AT,
    user: { id: 'u1', username: 'spacejens' },
    guildId: 'g1',
    guild: { name: 'The Pitch' },
    member: { nickname: 'Skitter' },
    channelId: 'c1',
    channel: { name: 'general' },
    options: { data: [] },
    ...overrides,
  } as unknown as ChatInputCommandInteraction;
}

function commandOptions(
  interaction: ChatInputCommandInteraction,
  overrides: Partial<HandledInteractionOptions> = {},
): HandledInteractionOptions {
  return {
    interaction,
    kind: 'command',
    name: 'stats',
    parameters: [],
    outcome: 'success',
    ...overrides,
  };
}

describe('HandledInteractionBuilderService', () => {
  let builder: HandledInteractionBuilderService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [HandledInteractionBuilderService],
    }).compile();
    builder = moduleRef.get(HandledInteractionBuilderService);
  });

  describe('build', () => {
    it('extracts the Discord context of a guild interaction', () => {
      const parameters = [{ key: 'category', value: 'matches' }];

      expect(
        builder.build(commandOptions(commandInteraction(), { parameters })),
      ).toEqual({
        kind: 'command',
        name: 'stats',
        occurredAt: OCCURRED_AT,
        discordUserId: 'u1',
        username: 'spacejens',
        discordGuildId: 'g1',
        guildName: 'The Pitch',
        nickname: 'Skitter',
        discordChannelId: 'c1',
        channelName: 'general',
        outcome: 'success',
        errorMessage: undefined,
        parameters,
      });
    });

    it('carries the outcome and error message through', () => {
      const built = builder.build(
        commandOptions(commandInteraction(), {
          outcome: 'failure',
          errorMessage: 'boom',
        }),
      );

      expect(built.outcome).toBe('failure');
      expect(built.errorMessage).toBe('boom');
    });

    it('leaves guild fields unset for a DM', () => {
      const built = builder.build(
        commandOptions(
          commandInteraction({
            guildId: null,
            guild: null,
            member: null,
            channel: null,
          }),
        ),
      );

      expect(built.discordGuildId).toBeUndefined();
      expect(built.guildName).toBeUndefined();
      expect(built.nickname).toBeUndefined();
      expect(built.channelName).toBeUndefined();
    });

    it('leaves the channel name unset for a channel without a name', () => {
      expect(
        builder.build(commandOptions(commandInteraction({ channel: {} })))
          .channelName,
      ).toBeUndefined();
    });

    it('leaves the channel name unset when the channel name is null', () => {
      expect(
        builder.build(
          commandOptions(commandInteraction({ channel: { name: null } })),
        ).channelName,
      ).toBeUndefined();
    });

    it('reads the nickname from a raw API member (nick, not nickname)', () => {
      expect(
        builder.build(
          commandOptions(
            commandInteraction({ member: { nick: 'RawSkitter' } }),
          ),
        ).nickname,
      ).toBe('RawSkitter');
    });

    it('leaves the nickname unset when neither nickname nor nick is present', () => {
      expect(
        builder.build(commandOptions(commandInteraction({ member: {} })))
          .nickname,
      ).toBeUndefined();
    });

    it('leaves the nickname unset when a cached member has no nickname set', () => {
      expect(
        builder.build(
          commandOptions(commandInteraction({ member: { nickname: null } })),
        ).nickname,
      ).toBeUndefined();
    });

    it('leaves the nickname unset when a raw API member has no nickname set', () => {
      expect(
        builder.build(
          commandOptions(commandInteraction({ member: { nick: null } })),
        ).nickname,
      ).toBeUndefined();
    });

    it('builds a component interaction under its given kind and name', () => {
      const button = commandInteraction({
        customId: 'deepdive:era:42',
      }) as unknown as ButtonInteraction;

      const built = builder.build({
        interaction: button,
        kind: 'button',
        name: 'deepdive:era:',
        parameters: [{ key: 'id', value: '42' }],
        outcome: 'success',
      });

      expect(built.kind).toBe('button');
      expect(built.name).toBe('deepdive:era:');
      expect(built.parameters).toEqual([{ key: 'id', value: '42' }]);
    });
  });

  describe('commandParameters', () => {
    it('returns one parameter per option, stringifying non-strings', () => {
      const interaction = commandInteraction({
        options: {
          data: [
            { name: 'category', value: 'matches' },
            { name: 'limit', value: 5 },
            { name: 'flag', value: true },
            { name: 'missing', value: undefined },
          ],
        },
      });

      expect(builder.commandParameters(interaction)).toEqual([
        { key: 'category', value: 'matches' },
        { key: 'limit', value: '5' },
        { key: 'flag', value: 'true' },
        { key: 'missing', value: undefined },
      ]);
    });

    it('returns no parameters for a command without options', () => {
      expect(builder.commandParameters(commandInteraction())).toEqual([]);
    });
  });

  describe('componentIdParameters', () => {
    it('returns the customId remainder after the prefix as an id parameter', () => {
      expect(
        builder.componentIdParameters('deepdive:era:menu:0', 'deepdive:era:'),
      ).toEqual([{ key: 'id', value: 'menu:0' }]);
    });

    it('returns no parameter when the customId is exactly the prefix', () => {
      expect(
        builder.componentIdParameters('deepdive:era:', 'deepdive:era:'),
      ).toEqual([]);
    });
  });
});
