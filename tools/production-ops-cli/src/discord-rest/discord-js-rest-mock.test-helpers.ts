import { vi } from 'vitest';

/**
 * Test-only helper. Do not import from production code.
 *
 * `DiscordRestService` constructs its own discord.js `REST` client per call
 * instead of receiving it by injection, so its spec replaces the whole
 * `discord.js` module:
 *
 * ```ts
 * vi.mock('discord.js', async () =>
 *   (await import('./discord-js-rest-mock.test-helpers.js')).discordJsModuleMock(),
 * );
 * ```
 *
 * The mocked `REST` constructor returns the mock most recently built by
 * `installDiscordRestMock()`, which the spec calls in its `beforeEach` before
 * compiling the service, so every test gets brand new, inert `vi.fn()`s. The
 * spec calls `resetDiscordRestMock()` in its `afterEach`, so a test that
 * forgets to install a mock fails loudly instead of reusing the previous one.
 *
 * This module must not import `discord.js`: it is loaded from inside the
 * module mock's factory.
 */

type MockFn = ReturnType<typeof vi.fn>;

export interface MockRest {
  setToken: MockFn;
  get: MockFn;
}

let installed: MockRest | undefined;

function current(): MockRest {
  if (installed === undefined) {
    throw new Error(
      'installDiscordRestMock() must run before DiscordRestService is used',
    );
  }
  return installed;
}

/**
 * Builds a fresh `REST` mock, with `setToken` returning the mock itself as the
 * real client does, and makes it the one the mocked constructor returns.
 */
export function installDiscordRestMock(): MockRest {
  const rest: MockRest = { setToken: vi.fn(), get: vi.fn() };
  rest.setToken.mockReturnValue(rest);
  installed = rest;
  return rest;
}

/** Discards the current mock, so the mocked constructor throws until reinstalled. */
export function resetDiscordRestMock(): void {
  installed = undefined;
}

/**
 * Stand-in for `@discordjs/rest`'s `DiscordAPIError`, with the same leading
 * constructor parameters, so the spec can build one through the (mocked)
 * `discord.js` import and the service's `instanceof` check matches it.
 */
class FakeDiscordAPIError extends Error {
  constructor(
    rawError: { message: string },
    public readonly code: number | string,
    public readonly status: number,
    public readonly method: string,
    public readonly url: string,
  ) {
    super(rawError.message);
  }
}

/**
 * Stand-in for `@discordjs/rest`'s `HTTPError`, which carries the status code
 * and uses only the status text as its message.
 */
class FakeHTTPError extends Error {
  constructor(
    public readonly status: number,
    statusText: string,
    public readonly method: string,
    public readonly url: string,
  ) {
    super(statusText);
  }
}

/** The replacement `discord.js` module, for the spec's `vi.mock` factory. */
export function discordJsModuleMock(): Record<string, unknown> {
  return {
    REST: vi.fn(function () {
      return current();
    }),
    // Distinguishable fake routes, so tests can assert the right endpoint was
    // targeted without depending on discord-api-types' real route building.
    Routes: {
      channelMessage: vi.fn(
        (channelId: string, messageId: string) =>
          `/fake/channels/${channelId}/messages/${messageId}`,
      ),
      channelMessages: vi.fn(
        (channelId: string) => `/fake/channels/${channelId}/messages`,
      ),
    },
    DiscordAPIError: FakeDiscordAPIError,
    HTTPError: FakeHTTPError,
  };
}
