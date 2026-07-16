import { expect, vi } from 'vitest';

/**
 * Test-only helper. Do not import from production code.
 *
 * Encapsulates the database-timeout fallback assertion shared across the
 * `/insights` toplist fact resolvers: install fake timers, invoke the resolver
 * with a service whose query never resolves, advance past the 2000ms timeout,
 * and assert the resolver falls back to `expectedMessage` (default `'I am stunned'`).
 * Real timers are always restored.
 *
 * @param invoke  calls the resolver under test with the supplied fake service
 * @param makeNeverResolvingService  builds a service whose relevant query
 *   returns `new Promise(() => {})` (never settles)
 * @param expectedMessage  the expected fallback message (default `'I am stunned'`)
 */
export async function expectTimeoutFallback<S>(
  invoke: (service: S) => Promise<unknown>,
  makeNeverResolvingService: () => S,
  expectedMessage = 'I am stunned',
): Promise<void> {
  vi.useFakeTimers();
  try {
    const promise = invoke(makeNeverResolvingService());
    await vi.advanceTimersByTimeAsync(2000);
    await expect(promise).resolves.toBe(expectedMessage);
  } finally {
    vi.useRealTimers();
  }
}

/**
 * Test-only helper. Do not import from production code.
 *
 * Asserts a resolver produced the standard single-embed leaderboard result.
 */
export function expectLeaderboardEmbed(
  result: unknown,
  expectedTitle: string,
  expectedDescription: string,
): void {
  expect(result).toEqual({
    embeds: [{ title: expectedTitle, description: expectedDescription }],
  });
}
