import type { Db } from '@blood-bowl-tracker/db';
import type { Mock } from 'vitest';
import { mock } from 'vitest-mock-extended';

/**
 * A stand-in for a drizzle fluent query builder: builder methods are
 * auto-created on demand as `vi.fn()`s returning the same chain, so specs read
 * `chain.where.mock.calls` to assert on captured drizzle conditions.
 *
 * `then` is defined explicitly because drizzle builders are thenables and
 * awaiting an auto-created `then` mock never settles.
 *
 * Reachable as `@blood-bowl-tracker/review-harness/test-helpers`, kept off the
 * package's main barrel so importing the harness never pulls Vitest into a
 * tool's runtime graph.
 *
 * The sibling `package.json` declaring `"type": "module"` is required: without
 * it TypeScript's `nodenext` resolution (driven by the source file's nearest
 * `package.json`, which defaults this package to CommonJS) compiles the
 * `vitest-mock-extended` import to a `require()`, whose CJS entry point
 * `require()`s vitest — which vitest refuses. The build script copies that
 * file next to the compiled output so `dist/test-helpers/` is ESM too.
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
