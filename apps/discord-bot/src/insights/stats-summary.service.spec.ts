import { describe, it, expect, vi } from 'vitest';
import { StatsSummaryService } from './stats-summary.service';
import type { Db } from '@blood-bowl-tracker/db';

// A count query resolves to `[{ count: n }]`. `countAll` awaits the `from(...)`
// builder directly; `countCompetitionsByType` awaits `.where(...)`. Both must
// resolve to the same rows, so the builder is thenable AND has `.where`.
function countRows(n: number) {
  const rows = [{ count: n }];
  return {
    where: vi.fn().mockResolvedValue(rows),
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
  };
}

// `from` is called once per count, in this order:
// coaches, teams, matches, competitions(total), competitions(season), competitions(cup)
function makeDb(values: number[]): Db {
  const from = vi.fn();
  for (const n of values) from.mockReturnValueOnce(countRows(n));
  const db = { select: vi.fn(() => ({ from })) };
  return db as unknown as Db;
}

describe('StatsSummaryService', () => {
  it('builds the summary message from the counts', async () => {
    const service = new StatsSummaryService(makeDb([2, 5, 12, 7, 4, 3]));
    const message = await service.buildSummaryMessage();
    expect(message).toBe(
      'There have been 2 coaches and 5 teams. A total of 12 matches have ' +
        'been played in 7 competitions (4 seasons, 3 cups)',
    );
  });

  it('handles all-zero counts', async () => {
    const service = new StatsSummaryService(makeDb([0, 0, 0, 0, 0, 0]));
    const message = await service.buildSummaryMessage();
    expect(message).toBe(
      'There have been 0 coaches and 0 teams. A total of 0 matches have ' +
        'been played in 0 competitions (0 seasons, 0 cups)',
    );
  });

  it('falls back to "I am stunned" when the database does not respond in time', async () => {
    vi.useFakeTimers();
    try {
      // Never resolves; also exposes `.where` (like `countRows` above) so
      // `countCompetitionsByType`'s `.from(...).where(...)` chain hangs too,
      // instead of throwing on a missing method.
      const forever = new Promise<never>(() => {});
      const hangingDb = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => forever),
            then: (
              resolve: (v: unknown) => unknown,
              reject: (e: unknown) => unknown,
            ) => forever.then(resolve, reject),
          })),
        })),
      } as unknown as Db;
      const service = new StatsSummaryService(hangingDb);
      const promise = service.buildSummaryMessage();
      await vi.advanceTimersByTimeAsync(2000);
      await expect(promise).resolves.toBe('I am stunned');
    } finally {
      vi.useRealTimers();
    }
  });
});
