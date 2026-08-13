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
 * Shared by every review tool spec that needs a drizzle mock. Reachable as
 * `@blood-bowl-tracker/review-harness/test-helpers` — kept off the package's
 * main barrel so importing the harness never pulls Vitest into a tool's
 * runtime graph. Test-only; excluded from coverage.
 *
 * Lives under `test-helpers/` alongside a sibling `package.json` declaring
 * `"type": "module"`. Without it, TypeScript's `nodenext` module setting
 * (driven by the *source* file's nearest `package.json`, which for the rest
 * of this package has no `"type"` field and so defaults to CommonJS) would
 * compile this file's `import { mock } from 'vitest-mock-extended'` down to
 * `require('vitest-mock-extended')`. That package's CJS entry point in turn
 * `require()`s `vitest` itself, which vitest deliberately refuses ("Vitest
 * cannot be imported in a CommonJS module using require()"). The sibling
 * `package.json` is copied next to the compiled output by this package's
 * `build` script, so `dist/test-helpers/` is recognized as ESM too and the
 * compiled file uses real `import` statements, resolving `vitest-mock-extended`
 * to its ESM build instead of tripping the CJS guard.
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
