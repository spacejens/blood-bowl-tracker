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
  ADMIN_COMMAND_ROLE_ID,
  DISCORD_BOT_TOKEN,
  DiscordClientService,
  MemberRoleAccessService,
  RESTRICTED_COMMAND_ROLE_ID,
} from './index';

const OCCURRED_AT = new Date('2026-09-25T12:00:00.000Z');

describe('DiscordClientService deferred commands', () => {
  let usageTracking: MockProxy<UsageTrackingService>;

  const flush = () => new Promise((resolve) => setImmediate(resolve));

  /**
   * The subject, built with a specific configured admin role id — which has
   * to exist before construction, so this is a per-test factory.
   */
  async function makeService(
    adminRoleId?: string,
  ): Promise<DiscordClientService> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        DiscordClientService,
        MemberRoleAccessService,
        { provide: DISCORD_BOT_TOKEN, useValue: 'my-token' },
        { provide: RESTRICTED_COMMAND_ROLE_ID, useValue: undefined },
        { provide: ADMIN_COMMAND_ROLE_ID, useValue: adminRoleId },
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

  /**
   * `deferReply` sets `deferred` to `true` as a side effect, exactly like the
   * real `discord.js` interaction it stands in for, so `sendReply`'s actual
   * acknowledgment-state check behaves the same way in tests as in
   * production. A test that overrides `deferReply` to reject bypasses this,
   * so `deferred` correctly stays `false`.
   */
  function commandInteraction(
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    const interaction: Record<string, unknown> = {
      isAutocomplete: () => false,
      isButton: () => false,
      isStringSelectMenu: () => false,
      isChatInputCommand: () => true,
      commandName: 'slowstuff',
      createdAt: OCCURRED_AT,
      user: { tag: 'spacejens#0001', id: 'u1', username: 'spacejens' },
      guildId: 'g1',
      guild: { name: 'The Pitch' },
      member: { roles: [] },
      channelId: 'c1',
      channel: { name: 'general' },
      options: { data: [] },
      deferred: false,
      replied: false,
      reply: vi.fn().mockResolvedValue(undefined),
      deferReply: vi.fn().mockImplementation(() => {
        interaction.deferred = true;
        return Promise.resolve(undefined);
      }),
      editReply: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    };
    return interaction;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.destroy.mockResolvedValue(undefined);
    mockClient.application.commands.set.mockResolvedValue(undefined);
    usageTracking = mock<UsageTrackingService>();
    usageTracking.recordInteraction.mockResolvedValue(undefined);
  });

  it('defers ephemerally before running the command, then edits the deferred reply with its result', async () => {
    const service = await makeService();
    const execute = vi.fn().mockResolvedValue('the answer');
    await service.registerCommands([
      { name: 'slowstuff', description: 'Slow', deferEphemeral: true, execute },
    ]);
    const interaction = commandInteraction();

    interactionHandler()(interaction);
    await flush();

    const deferReply = interaction.deferReply as ReturnType<typeof vi.fn>;
    expect(deferReply).toHaveBeenCalledWith({ flags: 64 });
    expect(deferReply.mock.invocationCallOrder[0]).toBeLessThan(
      execute.mock.invocationCallOrder[0],
    );
    expect(interaction.editReply).toHaveBeenCalledWith('the answer');
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it('drops the reply-only flags when editing a deferred reply with an embed', async () => {
    const service = await makeService();
    const embeds = [{ title: 'Done' }];
    await service.registerCommands([
      {
        name: 'slowstuff',
        description: 'Slow',
        deferEphemeral: true,
        execute: vi.fn().mockResolvedValue({ embeds, flags: 64 }),
      },
    ]);
    const interaction = commandInteraction();

    interactionHandler()(interaction);
    await flush();

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: undefined,
      embeds,
      components: undefined,
    });
  });

  it('edits the deferred reply with the generic failure text when the command throws, and records the failure', async () => {
    const service = await makeService();
    await service.registerCommands([
      {
        name: 'slowstuff',
        description: 'Slow',
        deferEphemeral: true,
        execute: vi.fn().mockRejectedValue(new Error('boom')),
      },
    ]);
    const interaction = commandInteraction();

    interactionHandler()(interaction);
    await flush();

    expect(interaction.editReply).toHaveBeenCalledWith('I am badly hurt');
    expect(interaction.reply).not.toHaveBeenCalled();
    expect(usageTracking.recordInteraction).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'failure' }),
    );
  });

  it('replies directly, without deferring, to a command that does not opt in', async () => {
    const service = await makeService();
    await service.registerCommands([
      {
        name: 'slowstuff',
        description: 'Fast',
        execute: vi.fn().mockResolvedValue('the answer'),
      },
    ]);
    const interaction = commandInteraction();

    interactionHandler()(interaction);
    await flush();

    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith('the answer');
  });

  it('falls back to a plain failure reply and still records usage when deferReply itself throws', async () => {
    const service = await makeService();
    const execute = vi.fn();
    await service.registerCommands([
      {
        name: 'slowstuff',
        description: 'Slow',
        deferEphemeral: true,
        execute,
      },
    ]);
    const interaction = commandInteraction({
      deferReply: vi.fn().mockRejectedValue(new Error('expired interaction')),
    });

    interactionHandler()(interaction);
    await flush();

    expect(execute).not.toHaveBeenCalled();
    expect(interaction.editReply).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith('I am badly hurt');
    expect(usageTracking.recordInteraction).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'failure' }),
    );
  });

  it('still records usage when both deferReply and the fallback failure reply throw', async () => {
    const service = await makeService();
    const execute = vi.fn();
    await service.registerCommands([
      {
        name: 'slowstuff',
        description: 'Slow',
        deferEphemeral: true,
        execute,
      },
    ]);
    const interaction = commandInteraction({
      deferReply: vi.fn().mockRejectedValue(new Error('expired interaction')),
      reply: vi.fn().mockRejectedValue(new Error('also expired')),
    });

    await expect(
      (async () => {
        interactionHandler()(interaction);
        await flush();
      })(),
    ).resolves.not.toThrow();

    expect(usageTracking.recordInteraction).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'failure' }),
    );
  });

  it('edits an already-deferred button reply instead of sending a plain reply', async () => {
    const service = await makeService();
    const handler = vi.fn().mockResolvedValue('era details');
    service.registerButtonHandler('deepdive:era:', handler);
    const reply = vi.fn().mockResolvedValue(undefined);
    const editReply = vi.fn().mockResolvedValue(undefined);
    const interaction = {
      isAutocomplete: () => false,
      isButton: () => true,
      isStringSelectMenu: () => false,
      isChatInputCommand: () => false,
      customId: 'deepdive:era:7',
      user: { tag: 'testuser#0001', id: '123' },
      channelId: '456',
      channel: { name: 'test-channel' },
      deferred: true,
      replied: false,
      reply,
      editReply,
    };
    interactionHandler()(interaction);
    await flush();
    expect(editReply).toHaveBeenCalledWith('era details');
    expect(reply).not.toHaveBeenCalled();
  });

  it('edits an already-deferred button reply with the failure message when the handler throws', async () => {
    const service = await makeService();
    service.registerButtonHandler(
      'deepdive:era:',
      vi.fn().mockRejectedValue(new Error('boom')),
    );
    const reply = vi.fn().mockResolvedValue(undefined);
    const editReply = vi.fn().mockResolvedValue(undefined);
    interactionHandler()({
      isAutocomplete: () => false,
      isButton: () => true,
      isStringSelectMenu: () => false,
      isChatInputCommand: () => false,
      customId: 'deepdive:era:7',
      user: { tag: 'u#1', id: '1' },
      channelId: '2',
      channel: { name: 'c' },
      deferred: true,
      replied: false,
      reply,
      editReply,
    });
    await flush();
    expect(editReply).toHaveBeenCalledWith('I am badly hurt');
    expect(reply).not.toHaveBeenCalled();
  });

  it('refuses a denied deferred command with a plain reply, never deferring', async () => {
    const service = await makeService('admin-role-1');
    const execute = vi.fn();
    await service.registerCommands([
      {
        name: 'slowstuff',
        description: 'Slow',
        deferEphemeral: true,
        restrictedRole: 'admin',
        execute,
      },
    ]);
    const interaction = commandInteraction();

    interactionHandler()(interaction);
    await flush();

    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith({
      content: "You don't have permission to use this command.",
      flags: 64,
    });
  });
});
