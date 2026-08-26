import type { Mock } from 'vitest';
import { vi } from 'vitest';
import { mock } from 'vitest-mock-extended';

import type { Db } from '../db.js';

/**
 * A stand-in for a drizzle fluent query builder. Every builder method
 * (`from`, `innerJoin`, `where`, `groupBy`, `orderBy`, `limit`, `values`,
 * `set`, `onConflictDoUpdate`, `returning`, ...) is auto-created on demand as a
 * `vi.fn()` that returns the same chain, so specs never have to enumerate them.
 * Tests read `chain.where.mock.calls` (usually via a workspace's own
 * `query-assertions` helpers) to assert on the captured drizzle condition
 * objects.
 *
 * `then` is defined explicitly rather than auto-created: drizzle builders are
 * thenables, and awaiting an auto-created `then` mock never settles, so the
 * await would hang forever. Test-only; excluded from coverage.
 *
 * Reachable as `@blood-bowl-tracker/db/test-helpers`, kept off the package's
 * main barrel so importing `@blood-bowl-tracker/db` never pulls Vitest into a
 * consumer's runtime graph.
 *
 * The sibling `package.json` declaring `"type": "module"` is required: without
 * it TypeScript's `nodenext` resolution (driven by the source file's nearest
 * `package.json`, which defaults this package to CommonJS) compiles the
 * `vitest-mock-extended` import to a `require()`, whose CJS entry point
 * `require()`s vitest — which vitest refuses. The build script copies that file
 * next to the compiled output so `dist/test-helpers/` is ESM too.
 */
export type QueryChain = Record<string, Mock> & {
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
  /**
   * The mocked `db.transaction`. Unlike every other db method (which falls
   * through to the generic chain-returning fallback), this one really invokes
   * its callback, handing it the same mock db as `tx`, so queries issued
   * inside a transaction land in `chains` exactly like queries issued outside
   * one, and resolves to whatever the callback returns. Specs assert on it to
   * prove a write path is transactional, and may `mockRejectedValue(...)` it
   * to simulate the transaction failing.
   */
  transaction: Mock;
}

function makeChain(rows: unknown[]): QueryChain {
  // `mock()`'s `mockImplementation` parameter type does not loosen a
  // Mock-typed property (here `then`, via the QueryChain index signature)
  // down to a plain function the way ts-essentials' real `DeepPartial` does,
  // so the object literal is typed explicitly and passed through an
  // intentional cast; the `chain` variable itself keeps its real `QueryChain`
  // type, so callers still get full type safety.
  const thenImpl: QueryChain['then'] = (resolve, reject) =>
    Promise.resolve(rows).then(resolve as never, reject as never) as never;
  const chain: QueryChain = mock<QueryChain>({ then: thenImpl } as never, {
    fallbackMockImplementation: () => chain,
  });
  return chain;
}

/**
 * Build a mock drizzle `Db`.
 *
 * Each `select` / `selectDistinct` / `insert` / `update` / `delete` call returns
 * a fresh chain; awaiting the nth chain resolves to `rowsPerQuery[n]`, or `[]`
 * when fewer row sets are supplied than queries issued.
 *
 * The `as unknown as Db` cast lives here, once, because drizzle's `select()`
 * return type varies with the field selection and cannot be faithfully mocked.
 */
export function mockDb(...rowsPerQuery: unknown[][]): MockDbResult {
  const chains: QueryChain[] = [];
  const next = (): QueryChain => {
    const chain = makeChain(rowsPerQuery[chains.length] ?? []);
    chains.push(chain);
    return chain;
  };
  // `transaction` is defined explicitly rather than auto-created: the generic
  // fallback ignores its arguments and would return an unrelated chain without
  // ever running the callback, so code under test would silently issue none of
  // its queries. Passing the mock db back as `tx` keeps every query inside the
  // callback flowing through the same chain-creation machinery.
  const transaction: Mock = vi.fn(
    async (callback: (tx: unknown) => unknown) => await callback(db),
  );
  const db = mock<Record<string, Mock>>(
    { transaction },
    {
      fallbackMockImplementation: () => next(),
    },
  );
  return { db: db as unknown as Db, chains, transaction };
}
