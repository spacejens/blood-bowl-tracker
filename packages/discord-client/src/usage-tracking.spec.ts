import type { RecordInteractionInput } from '@blood-bowl-tracker/discord-bot-usage';
import { UsageTrackingService } from '@blood-bowl-tracker/discord-bot-usage';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

interface MockClient {
  on: ReturnType<typeof vi.fn>;
  once: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  login: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  application: { commands: { set: ReturnType<typeof vi.fn> } };
  guilds: { cache: Map<string, unknown> };
  user: { tag: string };
}

const mockClient: MockClient = {
  on: vi.fn(),
  once: vi.fn(),
  off: vi.fn(),
  login: vi.fn(),
  destroy: vi.fn(),
  application: { commands: { set: vi.fn() } },
  guilds: { cache: new Map<string, unknown>() },
  user: { tag: 'test-bot#0001' },
};

vi.mock('discord.js', () => ({
  Client: vi.fn(function () {
    return mockClient;
  }),
  REST: vi.fn(function () {
    return { setToken: vi.fn(), post: vi.fn() };
  }),
  Routes: { channelMessages: vi.fn((id: string) => `/fake/${id}`) },
  GatewayIntentBits: { Guilds: 1 },
  InteractionContextType: { Guild: 0, BotDM: 1, PrivateChannel: 2 },
  ApplicationIntegrationType: { GuildInstall: 0, UserInstall: 1 },
}));

import { DISCORD_BOT_TOKEN, DiscordClientService } from './index';

const OCCURRED_AT = new Date('2026-09-09T12:00:00.000Z');

describe('DiscordClientService usage tracking', () => {
  let service: DiscordClientService;
  let usageTracking: MockProxy<UsageTrackingService>;

  const flush = () => new Promise((resolve) => setImmediate(resolve));

  function interactionHandler(): (interaction: unknown) => void {
    const call = mockClient.on.mock.calls.find(
      ([event]) => event === 'interactionCreate',
    );
    if (!call) throw new Error('interactionCreate handler not registered');
    return call[1] as (interaction: unknown) => void;
  }

  function commandInteraction(
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      isAutocomplete: () => false,
      isButton: () => false,
      isStringSelectMenu: () => false,
      isChatInputCommand: () => true,
      commandName: 'stats',
      createdAt: OCCURRED_AT,
      user: { tag: 'spacejens#0001', id: 'u1', username: 'spacejens' },
      guildId: 'g1',
      guild: { name: 'The Pitch' },
      member: { nickname: 'Skitter' },
      channelId: 'c1',
      channel: { name: 'general' },
      options: { data: [] },
      reply: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  function recorded(): RecordInteractionInput {
    return usageTracking.recordInteraction.mock.calls[0][0];
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    mockClient.destroy.mockResolvedValue(undefined);
    usageTracking = mock<UsageTrackingService>();
    usageTracking.recordInteraction.mockResolvedValue(undefined);
    const moduleRef = await Test.createTestingModule({
      providers: [
        DiscordClientService,
        { provide: DISCORD_BOT_TOKEN, useValue: 'my-token' },
        { provide: UsageTrackingService, useValue: usageTracking },
      ],
    }).compile();
    service = moduleRef.get(DiscordClientService);
    service.onModuleInit();
  });

  it('records a successful command with its Discord context', async () => {
    await service.registerCommands([
      {
        name: 'stats',
        description: 'Show stats',
        execute: vi.fn().mockResolvedValue('the answer'),
      },
    ]);

    interactionHandler()(commandInteraction());
    await flush();

    expect(recorded()).toEqual({
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
      parameters: [],
    });
  });

  it('records one parameter per command option, stringifying non-strings', async () => {
    await service.registerCommands([
      {
        name: 'stats',
        description: 'Show stats',
        execute: vi.fn().mockResolvedValue('ok'),
      },
    ]);

    interactionHandler()(
      commandInteraction({
        options: {
          data: [
            { name: 'category', value: 'matches' },
            { name: 'limit', value: 5 },
            { name: 'missing', value: undefined },
          ],
        },
      }),
    );
    await flush();

    expect(recorded().parameters).toEqual([
      { key: 'category', value: 'matches' },
      { key: 'limit', value: '5' },
      { key: 'missing', value: undefined },
    ]);
  });

  it('records a failure with the thrown error message and still replies', async () => {
    await service.registerCommands([
      {
        name: 'stats',
        description: 'Show stats',
        execute: vi.fn().mockRejectedValue(new Error('boom')),
      },
    ]);
    const interaction = commandInteraction();

    interactionHandler()(interaction);
    await flush();

    expect(recorded().outcome).toBe('failure');
    expect(recorded().errorMessage).toBe('boom');
    expect(interaction.reply).toHaveBeenCalledWith('I am badly hurt');
  });

  it('leaves guild fields unset for a DM', async () => {
    await service.registerCommands([
      {
        name: 'stats',
        description: 'Show stats',
        execute: vi.fn().mockResolvedValue('ok'),
      },
    ]);

    interactionHandler()(
      commandInteraction({
        guildId: null,
        guild: null,
        member: null,
        channel: null,
      }),
    );
    await flush();

    expect(recorded().discordGuildId).toBeUndefined();
    expect(recorded().guildName).toBeUndefined();
    expect(recorded().nickname).toBeUndefined();
    expect(recorded().channelName).toBeUndefined();
  });

  it('does not record an interaction with no registered handler', async () => {
    interactionHandler()(commandInteraction({ commandName: 'unknown' }));
    await flush();

    expect(usageTracking.recordInteraction).not.toHaveBeenCalled();
  });

  it('replies normally when recording itself fails', async () => {
    usageTracking.recordInteraction.mockRejectedValue(new Error('db down'));
    await service.registerCommands([
      {
        name: 'stats',
        description: 'Show stats',
        execute: vi.fn().mockResolvedValue('the answer'),
      },
    ]);
    const interaction = commandInteraction();

    interactionHandler()(interaction);
    await flush();

    expect(interaction.reply).toHaveBeenCalledWith('the answer');
  });
});
