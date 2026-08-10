import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface MockChannel {
  isSendable: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
}

interface MockGuild {
  commands: { set: ReturnType<typeof vi.fn> };
}

interface MockClient {
  channels: { fetch: ReturnType<typeof vi.fn> };
  application: { commands: { set: ReturnType<typeof vi.fn> } };
  guilds: { cache: Map<string, MockGuild> };
  once: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  login: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  user: { tag: string | undefined };
}

const mockChannel: MockChannel = {
  isSendable: vi.fn(),
  send: vi.fn(),
};

const mockClient: MockClient = {
  channels: { fetch: vi.fn() },
  application: { commands: { set: vi.fn() } },
  guilds: { cache: new Map<string, MockGuild>() },
  once: vi.fn(),
  on: vi.fn(),
  login: vi.fn(),
  destroy: vi.fn(),
  user: { tag: 'test-bot#0001' },
};

vi.mock('discord.js', () => ({
  Client: vi.fn(function () {
    return mockClient;
  }),
  GatewayIntentBits: { Guilds: 1 },
  // Real discord-api-types values, so assertions can compare against the
  // genuine enum members the service passes to Discord.
  InteractionContextType: { Guild: 0, BotDM: 1, PrivateChannel: 2 },
  ApplicationIntegrationType: { GuildInstall: 0, UserInstall: 1 },
}));

import { ApplicationIntegrationType, InteractionContextType } from 'discord.js';

import {
  DISCORD_BOT_TOKEN,
  DiscordClientModule,
  DiscordClientService,
} from './index';

describe('DiscordClientService', () => {
  let service: DiscordClientService;

  const flush = () => new Promise((resolve) => setImmediate(resolve));

  function interactionHandler(): (interaction: unknown) => void {
    const call = mockClient.on.mock.calls.find(
      ([event]) => event === 'interactionCreate',
    );
    if (!call) throw new Error('interactionCreate handler not registered');
    return call[1] as (interaction: unknown) => void;
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    mockClient.guilds.cache = new Map();
    mockClient.once.mockImplementation((event: string, cb: () => void) => {
      if (event === 'ready') cb();
      return mockClient;
    });
    mockClient.login.mockResolvedValue('my-token');
    mockClient.application.commands.set.mockResolvedValue(undefined);
    mockClient.destroy.mockResolvedValue(undefined);
    mockChannel.isSendable.mockReturnValue(true);
    const moduleRef = await Test.createTestingModule({
      providers: [
        DiscordClientService,
        { provide: DISCORD_BOT_TOKEN, useValue: 'my-token' },
      ],
    }).compile();
    service = moduleRef.get(DiscordClientService);
  });

  it('logs in with the provided token on module init', async () => {
    service.onModuleInit();
    await service.connect();
    expect(mockClient.login).toHaveBeenCalledWith('my-token');
  });

  it('does not log in during onModuleInit', () => {
    service.onModuleInit();

    expect(mockClient.login).not.toHaveBeenCalled();
    expect(mockClient.on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(mockClient.on).toHaveBeenCalledWith(
      'interactionCreate',
      expect.any(Function),
    );
  });

  it('logs in and waits for ready when connect is called', async () => {
    service.onModuleInit();
    await service.connect();

    expect(mockClient.login).toHaveBeenCalledWith('my-token');
  });

  it('sends a message to a sendable channel', async () => {
    mockClient.channels.fetch.mockResolvedValue(mockChannel);
    await service.sendMessage('123', 'hello');
    expect(mockClient.channels.fetch).toHaveBeenCalledWith('123');
    expect(mockChannel.send).toHaveBeenCalledWith('hello');
  });

  it('sends an embed payload as-is to a sendable channel', async () => {
    mockClient.channels.fetch.mockResolvedValue(mockChannel);
    const payload = {
      embeds: [{ title: 'I have knowledge of', description: 'Leagues: 3' }],
    };
    await service.sendMessage('123', payload);
    expect(mockChannel.send).toHaveBeenCalledWith(payload);
  });

  it('throws when the channel is not found', async () => {
    mockClient.channels.fetch.mockResolvedValue(null);
    await expect(service.sendMessage('123', 'hello')).rejects.toThrow(
      'Discord channel not found: 123',
    );
  });

  it('throws when the channel is not sendable', async () => {
    mockChannel.isSendable.mockReturnValue(false);
    mockClient.channels.fetch.mockResolvedValue(mockChannel);
    await expect(service.sendMessage('123', 'hello')).rejects.toThrow(
      'Discord channel is not sendable: 123',
    );
  });

  it('destroys the client on module destroy', async () => {
    await service.onModuleDestroy();
    expect(mockClient.destroy).toHaveBeenCalled();
  });

  it('registers a persistent error handler on module init', async () => {
    service.onModuleInit();
    await service.connect();
    expect(mockClient.on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('logs when the underlying client emits an error event', async () => {
    const logSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    service.onModuleInit();
    await service.connect();
    const call = mockClient.on.mock.calls.find(([event]) => event === 'error');
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
    const originalUser = mockClient.user;
    mockClient.user = { tag: undefined };
    const logSpy = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    try {
      service.onModuleInit();
      await service.connect();
      expect(logSpy).toHaveBeenCalledWith('Logged in as unknown');
    } finally {
      mockClient.user = originalUser;
    }
  });

  it('wraps a non-Error login rejection in an Error', async () => {
    mockClient.once.mockImplementation(() => mockClient);
    mockClient.login.mockRejectedValue('token invalid');
    service.onModuleInit();
    const result = service.connect();
    await expect(result).rejects.toBeInstanceOf(Error);
    await expect(result).rejects.toThrow('token invalid');
  });

  it('rejects init when login fails', async () => {
    mockClient.once.mockImplementation(() => mockClient);
    mockClient.login.mockRejectedValue(new Error('Invalid token'));
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

  it('rejects init when the client never becomes ready', async () => {
    vi.useFakeTimers();
    try {
      mockClient.once.mockImplementation(() => mockClient);
      mockClient.login.mockReturnValue(new Promise<string>(() => {}));
      service.onModuleInit();
      const initPromise = service.connect();
      const assertion = expect(initPromise).rejects.toThrow(
        'Discord client did not become ready',
      );
      await vi.advanceTimersByTimeAsync(30_000);
      await assertion;
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
    expect(mockClient.application.commands.set).toHaveBeenCalledTimes(1);
    expect(mockClient.application.commands.set).toHaveBeenCalledWith([
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
    mockClient.guilds.cache = new Map([
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
    mockClient.guilds.cache = new Map([
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
    expect(mockClient.application.commands.set).toHaveBeenCalledWith([
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
});
