import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('discord.js', async () =>
  (await import('./discord-js-mock.test-helpers.js')).discordJsModuleMock(),
);

import {
  ApplicationIntegrationType,
  Client,
  GatewayIntentBits,
  InteractionContextType,
  REST,
  Routes,
} from 'discord.js';

import type { DiscordJsMocks } from './discord-js-mock.test-helpers';
import {
  installDiscordJsMocks,
  resetDiscordJsMocks,
} from './discord-js-mock.test-helpers';
import { HandledInteractionBuilderService } from './handled-interaction-builder.service';
import {
  ADMIN_COMMAND_ROLE_ID,
  DISCORD_BOT_TOKEN,
  DiscordClientModule,
  DiscordClientService,
  MemberRoleAccessService,
  RESTRICTED_COMMAND_ROLE_ID,
} from './index';

describe('DiscordClientService', () => {
  let service: DiscordClientService;
  let discord: DiscordJsMocks;

  const flush = () => new Promise((resolve) => setImmediate(resolve));

  function interactionHandler(): (interaction: unknown) => void {
    const call = discord.client.on.mock.calls.find(
      ([event]) => event === 'interactionCreate',
    );
    if (!call) throw new Error('interactionCreate handler not registered');
    return call[1] as (interaction: unknown) => void;
  }

  function messageHandler(): (message: unknown) => void {
    const call = discord.client.on.mock.calls.find(
      ([event]) => event === 'messageCreate',
    );
    if (!call) throw new Error('messageCreate handler not registered');
    return call[1] as (message: unknown) => void;
  }

  beforeEach(async () => {
    // Clears call history on the module mock's own spies (`Client`, `REST`,
    // `Routes.channelMessages`), which several tests assert on, and on the
    // `Logger.prototype` spies some tests install. The discord.js mocks
    // themselves are built fresh just below.
    vi.clearAllMocks();
    discord = installDiscordJsMocks();
    discord.client.once.mockImplementation((event: string, cb: () => void) => {
      if (event === 'ready') cb();
      return discord.client;
    });
    discord.client.login.mockResolvedValue('my-token');
    discord.client.application.commands.set.mockResolvedValue(undefined);
    discord.client.destroy.mockResolvedValue(undefined);
    discord.channel.isSendable.mockReturnValue(true);
    discord.rest.setToken.mockReturnValue(discord.rest);
    discord.rest.post.mockResolvedValue(undefined);
    const moduleRef = await Test.createTestingModule({
      providers: [
        DiscordClientService,
        MemberRoleAccessService,
        { provide: DISCORD_BOT_TOKEN, useValue: 'my-token' },
        HandledInteractionBuilderService,
      ],
    }).compile();
    service = moduleRef.get(DiscordClientService);
  });

  afterEach(() => {
    resetDiscordJsMocks();
  });

  it('logs in with the provided token on module init', async () => {
    service.onModuleInit();
    await service.connect();
    expect(discord.client.login).toHaveBeenCalledWith('my-token');
  });

  it('does not log in during onModuleInit', () => {
    service.onModuleInit();

    expect(discord.client.login).not.toHaveBeenCalled();
    expect(discord.client.on).toHaveBeenCalledWith(
      'error',
      expect.any(Function),
    );
    expect(discord.client.on).toHaveBeenCalledWith(
      'interactionCreate',
      expect.any(Function),
    );
  });

  it('logs in and waits for ready when connect is called', async () => {
    service.onModuleInit();
    await service.connect();

    expect(discord.client.login).toHaveBeenCalledWith('my-token');
  });

  it('sends a message to a sendable channel', async () => {
    discord.client.channels.fetch.mockResolvedValue(discord.channel);
    await service.sendMessage('123', 'hello');
    expect(discord.client.channels.fetch).toHaveBeenCalledWith('123');
    expect(discord.channel.send).toHaveBeenCalledWith('hello');
  });

  it('sends an embed payload as-is to a sendable channel', async () => {
    discord.client.channels.fetch.mockResolvedValue(discord.channel);
    const payload = {
      embeds: [{ title: 'I have knowledge of', description: 'Leagues: 3' }],
    };
    await service.sendMessage('123', payload);
    expect(discord.channel.send).toHaveBeenCalledWith(payload);
  });

  it('throws when the channel is not found', async () => {
    discord.client.channels.fetch.mockResolvedValue(null);
    await expect(service.sendMessage('123', 'hello')).rejects.toThrow(
      'Discord channel not found: 123',
    );
  });

  it('throws when the channel is not sendable', async () => {
    discord.channel.isSendable.mockReturnValue(false);
    discord.client.channels.fetch.mockResolvedValue(discord.channel);
    await expect(service.sendMessage('123', 'hello')).rejects.toThrow(
      'Discord channel is not sendable: 123',
    );
  });

  it('posts a message over REST without touching the gateway client', async () => {
    const body = { embeds: [{ title: 'Bot starting as standby' }] };

    await service.sendMessageOverRest('123', body);

    expect(REST).toHaveBeenCalledWith({ version: '10' });
    expect(discord.rest.setToken).toHaveBeenCalledWith('my-token');
    expect(Routes.channelMessages).toHaveBeenCalledWith('123');
    expect(discord.rest.post).toHaveBeenCalledWith(
      '/fake/channels/123/messages',
      {
        body,
      },
    );
    expect(discord.client.channels.fetch).not.toHaveBeenCalled();
    expect(discord.client.login).not.toHaveBeenCalled();
  });

  it('propagates a rejection from the REST client', async () => {
    discord.rest.post.mockRejectedValue(new Error('401 Unauthorized'));

    await expect(
      service.sendMessageOverRest('123', { content: 'hi' }),
    ).rejects.toThrow('401 Unauthorized');
  });

  it('builds a fresh REST client on every call', async () => {
    await service.sendMessageOverRest('123', { content: 'one' });
    await service.sendMessageOverRest('456', { content: 'two' });

    expect(REST).toHaveBeenCalledTimes(2);
  });

  it('destroys the client on module destroy', async () => {
    await service.onModuleDestroy();
    expect(discord.client.destroy).toHaveBeenCalled();
  });

  it('registers a persistent error handler on module init', async () => {
    service.onModuleInit();
    await service.connect();
    expect(discord.client.on).toHaveBeenCalledWith(
      'error',
      expect.any(Function),
    );
  });

  it('logs when the underlying client emits an error event', async () => {
    const logSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    service.onModuleInit();
    await service.connect();
    const call = discord.client.on.mock.calls.find(
      ([event]) => event === 'error',
    );
    if (!call) throw new Error('error handler not registered');
    const errorHandler = call[1] as (error: unknown) => void;

    errorHandler(new Error('connection reset'));

    expect(logSpy).toHaveBeenCalledWith(
      'Discord client error',
      expect.any(Error),
    );
  });

  it('logs an unhandled interaction error when handling the interaction itself throws', async () => {
    const logSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    service.onModuleInit();
    await service.connect();

    interactionHandler()({
      isChatInputCommand: () => {
        throw new Error('malformed interaction');
      },
    });
    await flush();

    expect(logSpy).toHaveBeenCalledWith(
      'Unhandled interaction error',
      expect.any(Error),
    );
  });

  it('logs "unknown" when the ready client has no username tag', async () => {
    discord.client.user = { tag: undefined };
    const logSpy = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);

    service.onModuleInit();
    await service.connect();

    expect(logSpy).toHaveBeenCalledWith('Logged in as unknown');
  });

  it('wraps a non-Error login rejection in an Error', async () => {
    discord.client.once.mockImplementation(() => discord.client);
    discord.client.login.mockRejectedValue('token invalid');
    service.onModuleInit();
    const result = service.connect();
    await expect(result).rejects.toBeInstanceOf(Error);
    await expect(result).rejects.toThrow('token invalid');
  });

  it('rejects init when login fails', async () => {
    discord.client.once.mockImplementation(() => discord.client);
    discord.client.login.mockRejectedValue(new Error('Invalid token'));
    service.onModuleInit();
    await expect(service.connect()).rejects.toThrow('Invalid token');
  });

  it('provides DiscordClientService via forRootAsync', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DiscordClientModule.forRootAsync({ useFactory: () => 'tkn' })],
    }).compile();
    expect(moduleRef.get(DiscordClientService)).toBeInstanceOf(
      DiscordClientService,
    );
  });

  it('provides DiscordClientService via forRoot', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DiscordClientModule.forRoot({ token: 'tkn' })],
    }).compile();
    expect(moduleRef.get(DiscordClientService)).toBeInstanceOf(
      DiscordClientService,
    );
  });

  it('provides the restricted role id from the async factory', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        DiscordClientModule.forRootAsync({
          useFactory: () => 'tkn',
          useRestrictedRoleIdFactory: () => 'role-1',
        }),
      ],
    }).compile();
    expect(moduleRef.get(RESTRICTED_COMMAND_ROLE_ID)).toBe('role-1');
  });

  it('provides the restricted role id given to forRoot', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        DiscordClientModule.forRoot({
          token: 'tkn',
          restrictedRoleId: 'role-1',
        }),
      ],
    }).compile();
    expect(moduleRef.get(RESTRICTED_COMMAND_ROLE_ID)).toBe('role-1');
  });

  it('provides the admin role id from the async factory', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        DiscordClientModule.forRootAsync({
          useFactory: () => 'tkn',
          useAdminRoleIdFactory: () => 'admin-1',
        }),
      ],
    }).compile();
    expect(moduleRef.get(ADMIN_COMMAND_ROLE_ID)).toBe('admin-1');
  });

  it('provides the admin role id given to forRoot', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        DiscordClientModule.forRoot({ token: 'tkn', adminRoleId: 'admin-1' }),
      ],
    }).compile();
    expect(moduleRef.get(ADMIN_COMMAND_ROLE_ID)).toBe('admin-1');
  });

  it('leaves the admin role id unset when forRootAsync has no admin factory', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DiscordClientModule.forRootAsync({ useFactory: () => 'tkn' })],
    }).compile();
    expect(moduleRef.get(ADMIN_COMMAND_ROLE_ID)).toBeUndefined();
  });

  it('rejects init when the client never becomes ready', async () => {
    vi.useFakeTimers();
    try {
      let readyHandler: (() => void) | undefined;
      discord.client.once.mockImplementation(
        (event: string, cb: () => void) => {
          if (event === 'ready') readyHandler = cb;
          return discord.client;
        },
      );
      discord.client.login.mockReturnValue(new Promise<string>(() => {}));
      service.onModuleInit();
      const initPromise = service.connect();
      const assertion = expect(initPromise).rejects.toThrow(
        'Discord client did not become ready',
      );
      await vi.advanceTimersByTimeAsync(30_000);
      await assertion;

      // The login promise above never resolves, so a later `ready` event
      // would still be possible unless the timeout tore both down — a
      // duplicate gateway session if this machine has already released the
      // lock and a standby has taken over.
      expect(discord.client.off).toHaveBeenCalledWith('ready', readyHandler);
      expect(discord.client.destroy).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('registers commands globally with guild and DM contexts', async () => {
    await service.registerCommands([
      {
        name: 'stats',
        description: 'Show stats',
        execute: vi.fn().mockResolvedValue('stats'),
      },
    ]);
    expect(discord.client.application.commands.set).toHaveBeenCalledTimes(1);
    expect(discord.client.application.commands.set).toHaveBeenCalledWith([
      {
        name: 'stats',
        description: 'Show stats',
        contexts: [InteractionContextType.Guild, InteractionContextType.BotDM],
        integrationTypes: [ApplicationIntegrationType.GuildInstall],
      },
    ]);
  });

  it('clears the leftover guild-scoped commands from every guild', async () => {
    const guildA = { commands: { set: vi.fn().mockResolvedValue(undefined) } };
    const guildB = { commands: { set: vi.fn().mockResolvedValue(undefined) } };
    discord.client.guilds.cache = new Map([
      ['a', guildA],
      ['b', guildB],
    ]);
    await service.registerCommands([
      {
        name: 'stats',
        description: 'Show stats',
        execute: vi.fn().mockResolvedValue('stats'),
      },
    ]);
    expect(guildA.commands.set).toHaveBeenCalledWith([]);
    expect(guildB.commands.set).toHaveBeenCalledWith([]);
  });

  it('logs a warning and continues clearing other guilds when one guild fails', async () => {
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const guildA = {
      id: 'a',
      commands: { set: vi.fn().mockRejectedValue(new Error('403 Forbidden')) },
    };
    const guildB = {
      id: 'b',
      commands: { set: vi.fn().mockResolvedValue(undefined) },
    };
    discord.client.guilds.cache = new Map([
      ['a', guildA],
      ['b', guildB],
    ]);
    await service.registerCommands([
      {
        name: 'stats',
        description: 'Show stats',
        execute: vi.fn().mockResolvedValue('stats'),
      },
    ]);
    expect(guildA.commands.set).toHaveBeenCalledWith([]);
    expect(guildB.commands.set).toHaveBeenCalledWith([]);
    expect(warnSpy).toHaveBeenCalledWith(
      'Failed to clear guild-scoped commands for guild a',
      expect.any(Error),
    );
  });

  it('dispatches a registered command and replies with its output', async () => {
    service.onModuleInit();
    await service.connect();
    const execute = vi.fn().mockResolvedValue('the answer');
    await service.registerCommands([
      { name: 'stats', description: 'Show stats', execute },
    ]);
    const reply = vi.fn().mockResolvedValue(undefined);
    interactionHandler()({
      isAutocomplete: () => false,
      isButton: () => false,
      isStringSelectMenu: () => false,
      isChatInputCommand: () => true,
      commandName: 'stats',
      user: { tag: 'testuser#0001', id: '123' },
      channelId: '456',
      channel: { name: 'test-channel' },
      reply,
    });
    await flush();
    expect(execute).toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith('the answer');
  });

  it('logs the handled command, user, and channel on success', async () => {
    const logSpy = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    service.onModuleInit();
    await service.connect();
    const execute = vi.fn().mockResolvedValue('the answer');
    await service.registerCommands([
      { name: 'stats', description: 'Show stats', execute },
    ]);
    const reply = vi.fn().mockResolvedValue(undefined);
    interactionHandler()({
      isAutocomplete: () => false,
      isButton: () => false,
      isStringSelectMenu: () => false,
      isChatInputCommand: () => true,
      commandName: 'stats',
      user: { tag: 'spacejens#0001', id: '111' },
      channelId: '222',
      channel: { name: 'general' },
      reply,
    });
    await flush();
    expect(logSpy).toHaveBeenCalledWith(
      'Handled /stats from spacejens#0001 (111) in general (222)',
    );
  });

  it('logs "unknown channel" when the interaction channel is not cached', async () => {
    const logSpy = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    service.onModuleInit();
    await service.connect();
    const execute = vi.fn().mockResolvedValue('the answer');
    await service.registerCommands([
      { name: 'stats', description: 'Show stats', execute },
    ]);
    const reply = vi.fn().mockResolvedValue(undefined);
    interactionHandler()({
      isAutocomplete: () => false,
      isButton: () => false,
      isStringSelectMenu: () => false,
      isChatInputCommand: () => true,
      commandName: 'stats',
      user: { tag: 'spacejens#0001', id: '111' },
      channelId: '222',
      channel: null,
      reply,
    });
    await flush();
    expect(logSpy).toHaveBeenCalledWith(
      'Handled /stats from spacejens#0001 (111) in unknown channel (222)',
    );
  });

  it('does not log a "Handled" message when the command handler throws', async () => {
    const logSpy = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    service.onModuleInit();
    await service.registerCommands([
      {
        name: 'stats',
        description: 'Show stats',
        execute: vi.fn().mockRejectedValue(new Error('boom')),
      },
    ]);
    const reply = vi.fn().mockResolvedValue(undefined);
    interactionHandler()({
      isAutocomplete: () => false,
      isButton: () => false,
      isStringSelectMenu: () => false,
      isChatInputCommand: () => true,
      commandName: 'stats',
      user: { tag: 'spacejens#0001', id: '111' },
      channelId: '222',
      channel: { name: 'general' },
      reply,
    });
    await flush();
    expect(logSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Handled /stats'),
    );
  });

  it('ignores interactions for unregistered commands', async () => {
    service.onModuleInit();
    const reply = vi.fn();
    interactionHandler()({
      isAutocomplete: () => false,
      isButton: () => false,
      isStringSelectMenu: () => false,
      isChatInputCommand: () => true,
      commandName: 'unknown',
      reply,
    });
    await flush();
    expect(reply).not.toHaveBeenCalled();
  });

  it('ignores non-command interactions', async () => {
    service.onModuleInit();
    const reply = vi.fn();
    interactionHandler()({
      isAutocomplete: () => false,
      isButton: () => false,
      isStringSelectMenu: () => false,
      isChatInputCommand: () => false,
      reply,
    });
    await flush();
    expect(reply).not.toHaveBeenCalled();
  });

  it('forwards command options to the global command registration', async () => {
    await service.registerCommands([
      {
        name: 'insights',
        description: 'Share an insight',
        options: [
          {
            name: 'category',
            description: 'Pick a category',
            type: 3,
            autocomplete: true,
          },
        ],
        execute: vi.fn().mockResolvedValue('ok'),
      },
    ]);
    expect(discord.client.application.commands.set).toHaveBeenCalledWith([
      {
        name: 'insights',
        description: 'Share an insight',
        options: [
          {
            name: 'category',
            description: 'Pick a category',
            type: 3,
            autocomplete: true,
          },
        ],
        contexts: [InteractionContextType.Guild, InteractionContextType.BotDM],
        integrationTypes: [ApplicationIntegrationType.GuildInstall],
      },
    ]);
  });

  it('does not forward the restricted role to the global command registration', async () => {
    await service.registerCommands([
      {
        name: 'debugstuff',
        description: 'Debug: stuff',
        restrictedRole: 'debug',
        execute: vi.fn().mockResolvedValue('ok'),
      },
    ]);

    expect(discord.client.application.commands.set).toHaveBeenCalledWith([
      {
        name: 'debugstuff',
        description: 'Debug: stuff',
        contexts: [InteractionContextType.Guild, InteractionContextType.BotDM],
        integrationTypes: [ApplicationIntegrationType.GuildInstall],
      },
    ]);
  });

  it('passes the interaction into the command execute handler', async () => {
    service.onModuleInit();
    const execute = vi.fn().mockResolvedValue('the answer');
    await service.registerCommands([
      { name: 'stats', description: 'Show stats', execute },
    ]);
    const reply = vi.fn().mockResolvedValue(undefined);
    const interaction = {
      isAutocomplete: () => false,
      isButton: () => false,
      isStringSelectMenu: () => false,
      isChatInputCommand: () => true,
      commandName: 'stats',
      user: { tag: 'testuser#0001', id: '123' },
      channelId: '456',
      channel: { name: 'test-channel' },
      reply,
    };
    interactionHandler()(interaction);
    await flush();
    expect(execute).toHaveBeenCalledWith(interaction);
  });

  it('replies with an error when a command handler throws', async () => {
    service.onModuleInit();
    await service.registerCommands([
      {
        name: 'stats',
        description: 'Show stats',
        execute: vi.fn().mockRejectedValue(new Error('boom')),
      },
    ]);
    const reply = vi.fn().mockResolvedValue(undefined);
    interactionHandler()({
      isAutocomplete: () => false,
      isButton: () => false,
      isStringSelectMenu: () => false,
      isChatInputCommand: () => true,
      commandName: 'stats',
      reply,
    });
    await flush();
    expect(reply).toHaveBeenCalledWith('I am badly hurt');
  });

  it('responds to an autocomplete interaction with the command choices', async () => {
    service.onModuleInit();
    const autocomplete = vi
      .fn()
      .mockResolvedValue([{ name: 'coach', value: 'coach' }]);
    await service.registerCommands([
      {
        name: 'insights',
        description: 'Share an insight',
        execute: vi.fn().mockResolvedValue('ok'),
        autocomplete,
      },
    ]);
    const respond = vi.fn().mockResolvedValue(undefined);
    const interaction = {
      isAutocomplete: () => true,
      isButton: () => false,
      isStringSelectMenu: () => false,
      isChatInputCommand: () => false,
      commandName: 'insights',
      respond,
    };
    interactionHandler()(interaction);
    await flush();
    expect(autocomplete).toHaveBeenCalledWith(interaction);
    expect(respond).toHaveBeenCalledWith([{ name: 'coach', value: 'coach' }]);
  });

  it('ignores autocomplete interactions for commands without an autocomplete handler', async () => {
    service.onModuleInit();
    await service.registerCommands([
      { name: 'stats', description: 'Show stats', execute: vi.fn() },
    ]);
    const respond = vi.fn();
    interactionHandler()({
      isAutocomplete: () => true,
      isButton: () => false,
      isStringSelectMenu: () => false,
      isChatInputCommand: () => false,
      commandName: 'stats',
      respond,
    });
    await flush();
    expect(respond).not.toHaveBeenCalled();
  });

  it('dispatches a button interaction to the handler whose prefix matches its customId', async () => {
    service.onModuleInit();
    const handler = vi.fn().mockResolvedValue('era details');
    service.registerButtonHandler('deepdive:era:', handler);
    const reply = vi.fn().mockResolvedValue(undefined);
    const interaction = {
      isAutocomplete: () => false,
      isButton: () => true,
      isStringSelectMenu: () => false,
      isChatInputCommand: () => false,
      customId: 'deepdive:era:7',
      user: { tag: 'testuser#0001', id: '123' },
      channelId: '456',
      channel: { name: 'test-channel' },
      reply,
    };
    interactionHandler()(interaction);
    await flush();
    expect(handler).toHaveBeenCalledWith(interaction);
    expect(reply).toHaveBeenCalledWith('era details');
  });

  it('ignores a button interaction whose customId matches no registered prefix', async () => {
    service.onModuleInit();
    service.registerButtonHandler('deepdive:era:', vi.fn());
    const reply = vi.fn();
    interactionHandler()({
      isAutocomplete: () => false,
      isButton: () => true,
      isStringSelectMenu: () => false,
      isChatInputCommand: () => false,
      customId: 'something:else:1',
      reply,
    });
    await flush();
    expect(reply).not.toHaveBeenCalled();
  });

  it('replies with an error when a button handler throws', async () => {
    service.onModuleInit();
    service.registerButtonHandler(
      'deepdive:era:',
      vi.fn().mockRejectedValue(new Error('boom')),
    );
    const reply = vi.fn().mockResolvedValue(undefined);
    interactionHandler()({
      isAutocomplete: () => false,
      isButton: () => true,
      isStringSelectMenu: () => false,
      isChatInputCommand: () => false,
      customId: 'deepdive:era:7',
      user: { tag: 'u#1', id: '1' },
      channelId: '2',
      channel: { name: 'c' },
      reply,
    });
    await flush();
    expect(reply).toHaveBeenCalledWith('I am badly hurt');
  });

  it('dispatches a select menu interaction to the handler whose prefix matches its customId', async () => {
    service.onModuleInit();
    const handler = vi.fn().mockResolvedValue('era details');
    service.registerSelectMenuHandler('deepdive:era:', handler);
    const reply = vi.fn().mockResolvedValue(undefined);
    const interaction = {
      isAutocomplete: () => false,
      isButton: () => false,
      isStringSelectMenu: () => true,
      isChatInputCommand: () => false,
      customId: 'deepdive:era:menu:0',
      values: ['7'],
      user: { tag: 'testuser#0001', id: '123' },
      channelId: '456',
      channel: { name: 'test-channel' },
      reply,
    };
    interactionHandler()(interaction);
    await flush();
    expect(handler).toHaveBeenCalledWith(interaction);
    expect(reply).toHaveBeenCalledWith('era details');
  });

  it('ignores a select menu interaction whose customId matches no registered prefix', async () => {
    service.onModuleInit();
    service.registerSelectMenuHandler('deepdive:era:', vi.fn());
    const reply = vi.fn();
    interactionHandler()({
      isAutocomplete: () => false,
      isButton: () => false,
      isStringSelectMenu: () => true,
      isChatInputCommand: () => false,
      customId: 'something:else:menu:0',
      values: ['7'],
      reply,
    });
    await flush();
    expect(reply).not.toHaveBeenCalled();
  });

  it('does not route a select menu interaction to a button handler', async () => {
    service.onModuleInit();
    const buttonHandler = vi.fn();
    service.registerButtonHandler('deepdive:era:', buttonHandler);
    const reply = vi.fn();
    interactionHandler()({
      isAutocomplete: () => false,
      isButton: () => false,
      isStringSelectMenu: () => true,
      isChatInputCommand: () => false,
      customId: 'deepdive:era:menu:0',
      values: ['7'],
      reply,
    });
    await flush();
    expect(buttonHandler).not.toHaveBeenCalled();
    expect(reply).not.toHaveBeenCalled();
  });

  it('logs the handled select menu, chosen value, user, and channel on success', async () => {
    const logSpy = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    service.onModuleInit();
    service.registerSelectMenuHandler(
      'deepdive:era:',
      vi.fn().mockResolvedValue('era details'),
    );
    const reply = vi.fn().mockResolvedValue(undefined);
    interactionHandler()({
      isAutocomplete: () => false,
      isButton: () => false,
      isStringSelectMenu: () => true,
      isChatInputCommand: () => false,
      customId: 'deepdive:era:menu:0',
      values: ['7'],
      user: { tag: 'spacejens#0001', id: '111' },
      channelId: '222',
      channel: { name: 'general' },
      reply,
    });
    await flush();
    expect(logSpy).toHaveBeenCalledWith(
      'Handled select menu deepdive:era:menu:0 (7) from spacejens#0001 (111) in general (222)',
    );
  });

  it('replies with an error when a select menu handler throws', async () => {
    service.onModuleInit();
    service.registerSelectMenuHandler(
      'deepdive:era:',
      vi.fn().mockRejectedValue(new Error('boom')),
    );
    const reply = vi.fn().mockResolvedValue(undefined);
    interactionHandler()({
      isAutocomplete: () => false,
      isButton: () => false,
      isStringSelectMenu: () => true,
      isChatInputCommand: () => false,
      customId: 'deepdive:era:menu:0',
      values: ['7'],
      user: { tag: 'u#1', id: '1' },
      channelId: '2',
      channel: { name: 'c' },
      reply,
    });
    await flush();
    expect(reply).toHaveBeenCalledWith('I am badly hurt');
  });

  describe('component handler lookup', () => {
    it('finds a button handler by customId prefix', () => {
      const handler = vi.fn();
      service.registerButtonHandler('coach:', handler);

      expect(service.findButtonHandler('coach:42')).toBe(handler);
    });

    it('returns undefined when no button prefix matches', () => {
      service.registerButtonHandler('coach:', vi.fn());

      expect(service.findButtonHandler('team:42')).toBeUndefined();
    });

    it('finds a select menu handler by customId prefix', () => {
      const handler = vi.fn();
      service.registerSelectMenuHandler('coach:', handler);

      expect(service.findSelectMenuHandler('coach:menu:0')).toBe(handler);
    });

    it('returns undefined when no select menu prefix matches', () => {
      service.registerSelectMenuHandler('coach:', vi.fn());

      expect(service.findSelectMenuHandler('team:menu:0')).toBeUndefined();
    });

    it('keeps the button and select menu registries separate', () => {
      const button = vi.fn();
      service.registerButtonHandler('coach:', button);

      expect(service.findSelectMenuHandler('coach:42')).toBeUndefined();
    });
  });

  it('declares the gateway intents needed to read message embeds', () => {
    expect(Client).toHaveBeenCalledWith({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });
  });

  it('registers a messageCreate listener on module init', () => {
    service.onModuleInit();

    expect(discord.client.on).toHaveBeenCalledWith(
      'messageCreate',
      expect.any(Function),
    );
  });

  it('dispatches a created message to every registered handler', async () => {
    const first = vi.fn().mockResolvedValue(undefined);
    const second = vi.fn().mockResolvedValue(undefined);
    service.registerMessageHandler(first);
    service.registerMessageHandler(second);
    service.onModuleInit();
    const message = { id: 'm1' };

    messageHandler()(message);
    await flush();

    expect(first).toHaveBeenCalledWith(message);
    expect(second).toHaveBeenCalledWith(message);
  });

  it('logs and keeps dispatching when a message handler rejects', async () => {
    const errorLog = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const failing = vi.fn().mockRejectedValue(new Error('boom'));
    const healthy = vi.fn().mockResolvedValue(undefined);
    service.registerMessageHandler(failing);
    service.registerMessageHandler(healthy);
    service.onModuleInit();

    messageHandler()({ id: 'm2' });
    await flush();

    expect(healthy).toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalledWith(
      'Unhandled message handler error',
      expect.any(Error),
    );
    errorLog.mockRestore();
  });
});
