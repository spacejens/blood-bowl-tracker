import type { ReservedSql, Sql } from 'postgres';
import { vi } from 'vitest';

export interface LockSqlMock {
  /** Pass this as the `LOCK_SQL` provider value. */
  sql: Sql;
  /** Queue the rows the next tagged-template query resolves to. */
  queueRows: (rows: unknown[]) => void;
  /** Make `sql.reserve()` reject with `error`. */
  reserveFails: (error: Error) => void;
  /** Make every query on the reserved connection reject with `error`. */
  queriesFail: (error: Error) => void;
  /** SQL text (template literal parts joined by `?`) of every query run. */
  queries: string[];
  /** Values interpolated into every query run, in order. */
  values: unknown[][];
  release: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  reserve: ReturnType<typeof vi.fn>;
}

/**
 * Minimal stand-in for a `postgres.js` client and its reserved connection.
 * Queries resolve to the rows queued with `queueRows`, in order; an unqueued
 * query resolves to `[]`.
 */
export function createLockSqlMock(): LockSqlMock {
  const queued: unknown[][] = [];
  const queries: string[] = [];
  const values: unknown[][] = [];
  let queryError: Error | undefined;

  const runQuery = (
    strings: TemplateStringsArray,
    ...params: unknown[]
  ): Promise<unknown[]> => {
    queries.push(strings.join('?'));
    values.push(params);
    return queryError
      ? Promise.reject(queryError)
      : Promise.resolve(queued.shift() ?? []);
  };

  const release = vi.fn();
  const reserved = Object.assign(vi.fn(runQuery), {
    release,
  }) as unknown as ReservedSql;

  const reserve = vi.fn().mockResolvedValue(reserved);
  const end = vi.fn().mockResolvedValue(undefined);
  const sql = Object.assign(vi.fn(runQuery), {
    reserve,
    end,
  }) as unknown as Sql;

  return {
    sql,
    queueRows: (rows) => queued.push(rows),
    reserveFails: (error) => reserve.mockRejectedValue(error),
    queriesFail: (error) => {
      queryError = error;
    },
    queries,
    values,
    release,
    end,
    reserve,
  };
}
