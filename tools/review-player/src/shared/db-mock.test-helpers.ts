import type { Db } from '@blood-bowl-tracker/db';
import type { Mock } from 'vitest';
import { mock } from 'vitest-mock-extended';

/**
 * A stand-in for a drizzle fluent query builder. Every builder method
 * (`from`, `innerJoin`, `where`, `orderBy`, `limit`, ...) is auto-created on
 * demand as a `vi.fn()` returning the same chain, so specs never have to
 * enumerate them. Tests read `chain.where.mock.calls` to assert on the
 * captured drizzle condition objects.
 *
 * `then` is defined explicitly rather than auto-created: drizzle builders are
 * thenables, and awaiting an auto-created `then` mock never settles.
 *
 * Copied from `tools/review-match/src/shared/db-mock.test-helpers.ts` (itself
 * copied from `packages/game-data`), because a `src/`-internal test helper is
 * not reachable across workspaces.
 */
type QueryChain = Record<string, Mock> & {
  then: <TResult1 = unknown, TResult2 = never>(
    resolve?: (value: unknown) => TResult1 | PromiseLike<TResult1>,
    reject?: (reason: unknown) => TResult2 | PromiseLike<TResult2>,
  ) => Promise<TResult1 | TResult2>;
};

export interface MockDbResult {
  /** Cast to `Db` so it can be supplied as `{ provide: DB, useValue: db }`. */
  db: Db;
  /** One entry per issued query, in call order. */
  chains: QueryChain[];
}

function makeChain(rows: unknown[]): QueryChain {
  const thenImpl: QueryChain['then'] = (resolve, reject) =>
    Promise.resolve(rows).then(resolve as never, reject as never) as never;
  const chain: QueryChain = mock<QueryChain>({ then: thenImpl } as never, {
    fallbackMockImplementation: () => chain,
  });
  return chain;
}

/**
 * Build a mock drizzle `Db`. Each `select` / `selectDistinct` call returns a
 * fresh chain; awaiting the nth chain resolves to `rowsPerQuery[n]`, or `[]`
 * when fewer row sets are supplied than queries issued.
 */
export function mockDb(...rowsPerQuery: unknown[][]): MockDbResult {
  const chains: QueryChain[] = [];
  const next = (): QueryChain => {
    const chain = makeChain(rowsPerQuery[chains.length] ?? []);
    chains.push(chain);
    return chain;
  };
  const db = mock<Record<string, Mock>>(
    {},
    { fallbackMockImplementation: () => next() },
  );
  return { db: db as unknown as Db, chains };
}
