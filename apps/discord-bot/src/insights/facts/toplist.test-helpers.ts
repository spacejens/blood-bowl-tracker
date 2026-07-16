import { expect, vi } from 'vitest';

/**
 * Test-only helper. Do not import from production code.
 *
 * Encapsulates the database-timeout fallback assertion shared across the
 * `/insights` toplist fact resolvers: install fake timers, invoke the resolver
 * with a service whose query never resolves, advance past the 2000ms timeout,
 * and assert the resolver falls back to the 'I am stunned' message. Real timers
 * are always restored.
 *
 * @param invoke  calls the resolver under test with the supplied fake service
 * @param makeNeverResolvingService  builds a service whose relevant query
 *   returns `new Promise(() => {})` (never settles)
 */
export async function expectStunnedOnTimeout<S>(
  invoke: (service: S) => Promise<unknown>,
  makeNeverResolvingService: () => S,
): Promise<void> {
  vi.useFakeTimers();
  try {
    const promise = invoke(makeNeverResolvingService());
    await vi.advanceTimersByTimeAsync(2000);
    await expect(promise).resolves.toBe('I am stunned');
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
  title: string,
  description: string,
): void {
  expect(result).toEqual({ embeds: [{ title, description }] });
}
