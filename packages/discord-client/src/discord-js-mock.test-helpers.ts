import { vi } from 'vitest';

/**
 * Test-only helper. Do not import from production code.
 *
 * `DiscordClientService` constructs its own discord.js `Client` (and a `REST`
 * client per REST call) instead of receiving them by injection, so its specs
 * replace the whole `discord.js` module:
 *
 * ```ts
 * vi.mock('discord.js', async () =>
 *   (await import('./discord-js-mock.test-helpers.js')).discordJsModuleMock(),
 * );
 * ```
 *
 * The mocked `Client` and `REST` constructors return the set most recently
 * built by `installDiscordJsMocks()`, which each spec calls in its
 * `beforeEach` before compiling the service. Every test therefore gets brand
 * new, inert `vi.fn()`s with no implementation left over from an earlier
 * test; each spec stubs the behaviour it needs itself.
 *
 * This module must not import `discord.js`: it is loaded from inside the
 * module mock's factory.
 */

type MockFn = ReturnType<typeof vi.fn>;

export interface MockChannel {
  isSendable: MockFn;
  send: MockFn;
}

export interface MockGuild {
  commands: { set: MockFn };
}

export interface MockClient {
  channels: { fetch: MockFn };
  application: { commands: { set: MockFn } };
  guilds: { cache: Map<string, MockGuild> };
  once: MockFn;
  on: MockFn;
  off: MockFn;
  login: MockFn;
  destroy: MockFn;
  user: { tag: string | undefined };
}

export interface MockRest {
  setToken: MockFn;
  post: MockFn;
}

export interface DiscordJsMocks {
  client: MockClient;
  channel: MockChannel;
  rest: MockRest;
}

/** The current test's set; only ever assigned by `installDiscordJsMocks()`. */
let installed: DiscordJsMocks | undefined;

function current(): DiscordJsMocks {
  if (installed === undefined) {
    throw new Error(
      'installDiscordJsMocks() must run before DiscordClientService is built',
    );
  }
  return installed;
}

/**
 * Builds a fresh set of discord.js mocks and makes it the set the mocked
 * `Client` and `REST` constructors return.
 */
export function installDiscordJsMocks(): DiscordJsMocks {
  installed = {
    client: {
      channels: { fetch: vi.fn() },
      application: { commands: { set: vi.fn() } },
      guilds: { cache: new Map<string, MockGuild>() },
      once: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      login: vi.fn(),
      destroy: vi.fn(),
      user: { tag: 'test-bot#0001' },
    },
    channel: { isSendable: vi.fn(), send: vi.fn() },
    rest: { setToken: vi.fn(), post: vi.fn() },
  };
  return installed;
}

/** The replacement `discord.js` module, for a spec's `vi.mock` factory. */
export function discordJsModuleMock(): Record<string, unknown> {
  return {
    Client: vi.fn(function () {
      return current().client;
    }),
    REST: vi.fn(function () {
      return current().rest;
    }),
    // A distinguishable fake route, so tests can assert the right endpoint was
    // targeted without depending on discord-api-types' real route building.
    Routes: {
      channelMessages: vi.fn((id: string) => `/fake/channels/${id}/messages`),
    },
    GatewayIntentBits: { Guilds: 1, GuildMessages: 512, MessageContent: 32768 },
    // Real discord-api-types values, so assertions can compare against the
    // genuine enum members the service passes to Discord.
    InteractionContextType: { Guild: 0, BotDM: 1, PrivateChannel: 2 },
    ApplicationIntegrationType: { GuildInstall: 0, UserInstall: 1 },
    MessageFlags: { Ephemeral: 64 },
  };
}
