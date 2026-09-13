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
  MessageFlags: { Ephemeral: 64 },
}));

import {
  DISCORD_BOT_TOKEN,
  DiscordClientService,
  MemberRoleAccessService,
  RESTRICTED_COMMAND_ROLE_ID,
} from './index';

const ROLE_ID = 'role-1';
const OCCURRED_AT = new Date('2026-09-13T12:00:00.000Z');
const DENIAL_REPLY = {
  content: "You don't have permission to use this command.",
  flags: 64,
};

describe('DiscordClientService restricted commands', () => {
  let usageTracking: MockProxy<UsageTrackingService>;

  const flush = () => new Promise((resolve) => setImmediate(resolve));

  /**
   * The subject, built with a specific configured role id — which has to
   * exist before construction, so this is a per-test factory rather than one
   * subject built in `beforeEach`.
   */
  async function makeService(
    restrictedRoleId: string | undefined,
  ): Promise<DiscordClientService> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        DiscordClientService,
        MemberRoleAccessService,
        { provide: DISCORD_BOT_TOKEN, useValue: 'my-token' },
        { provide: RESTRICTED_COMMAND_ROLE_ID, useValue: restrictedRoleId },
        { provide: UsageTrackingService, useValue: usageTracking },
      ],
    }).compile();
    const service = moduleRef.get(DiscordClientService);
    service.onModuleInit();
    return service;
  }

  function interactionHandler(): (interaction: unknown) => void {
    const call = mockClient.on.mock.calls.find(
      ([event]) => event === 'interactionCreate',
    );
    if (!call) throw new Error('interactionCreate handler not registered');
    return call[1] as (interaction: unknown) => void;
  }

  /** A `/debugstuff` invocation, by default by a member without the role. */
  function commandInteraction(
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      isAutocomplete: () => false,
      isButton: () => false,
      isStringSelectMenu: () => false,
      isChatInputCommand: () => true,
      commandName: 'debugstuff',
      createdAt: OCCURRED_AT,
      user: { tag: 'spacejens#0001', id: 'u1', username: 'spacejens' },
      guildId: 'g1',
      guild: { name: 'The Pitch' },
      member: { roles: ['other'] },
      channelId: 'c1',
      channel: { name: 'general' },
      options: { data: [] },
      reply: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.destroy.mockResolvedValue(undefined);
    mockClient.application.commands.set.mockResolvedValue(undefined);
    usageTracking = mock<UsageTrackingService>();
    usageTracking.recordInteraction.mockResolvedValue(undefined);
  });

  it('runs a restricted command for a member holding the role', async () => {
    const service = await makeService(ROLE_ID);
    const execute = vi.fn().mockResolvedValue('the answer');
    await service.registerCommands([
      {
        name: 'debugstuff',
        description: 'Debug: stuff',
        restricted: true,
        execute,
      },
    ]);
    const interaction = commandInteraction({ member: { roles: [ROLE_ID] } });

    interactionHandler()(interaction);
    await flush();

    expect(execute).toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith('the answer');
  });

  it('refuses a restricted command for a member without the role', async () => {
    const service = await makeService(ROLE_ID);
    const execute = vi.fn().mockResolvedValue('the answer');
    await service.registerCommands([
      {
        name: 'debugstuff',
        description: 'Debug: stuff',
        restricted: true,
        execute,
      },
    ]);
    const interaction = commandInteraction();

    interactionHandler()(interaction);
    await flush();

    expect(execute).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(DENIAL_REPLY);
  });

  it('records a refused attempt as a failure', async () => {
    const service = await makeService(ROLE_ID);
    await service.registerCommands([
      {
        name: 'debugstuff',
        description: 'Debug: stuff',
        restricted: true,
        execute: vi.fn(),
      },
    ]);

    interactionHandler()(commandInteraction());
    await flush();

    expect(usageTracking.recordInteraction).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'command',
        name: 'debugstuff',
        discordUserId: 'u1',
        outcome: 'failure',
        errorMessage: 'Missing required role',
      }),
    );
  });

  it('refuses a restricted command invoked in a direct message', async () => {
    const service = await makeService(ROLE_ID);
    const execute = vi.fn().mockResolvedValue('the answer');
    await service.registerCommands([
      {
        name: 'debugstuff',
        description: 'Debug: stuff',
        restricted: true,
        execute,
      },
    ]);
    const interaction = commandInteraction({
      member: null,
      guildId: null,
      guild: null,
    });

    interactionHandler()(interaction);
    await flush();

    expect(execute).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(DENIAL_REPLY);
  });

  it('runs a restricted command when no role is configured', async () => {
    const service = await makeService(undefined);
    const execute = vi.fn().mockResolvedValue('the answer');
    await service.registerCommands([
      {
        name: 'debugstuff',
        description: 'Debug: stuff',
        restricted: true,
        execute,
      },
    ]);
    const interaction = commandInteraction();

    interactionHandler()(interaction);
    await flush();

    expect(execute).toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith('the answer');
  });

  it('leaves an unrestricted command open even when a role is configured', async () => {
    const service = await makeService(ROLE_ID);
    const execute = vi.fn().mockResolvedValue('the answer');
    await service.registerCommands([
      { name: 'debugstuff', description: 'Open', execute },
    ]);
    const interaction = commandInteraction();

    interactionHandler()(interaction);
    await flush();

    expect(execute).toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith('the answer');
  });
});
