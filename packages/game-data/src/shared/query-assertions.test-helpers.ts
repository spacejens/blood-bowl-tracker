import {
  Column,
  getColumnTable,
  getTableName,
  is,
  Param,
  SQL,
} from 'drizzle-orm';

/**
 * Shared introspection helpers for game-data service specs. The service methods
 * build real drizzle-orm condition objects (eq/and/inArray) and pass them to a
 * mocked `.where()` / `.innerJoin()`. These helpers reach into those captured
 * objects so tests assert the exact filter values and join columns, not merely
 * that a method was called. Test-only; excluded from coverage.
 */

/** Recover the literal value drizzle stored inside a `Param`. */
function paramValue(param: Param): string | number {
  return (param as unknown as { value: string | number }).value;
}

/**
 * Retrieve one recorded argument from a `vi.fn()` mock.
 * Generalizes the old `firstWhereCondition(builder)` (= firstCallArg(builder.where)).
 */
export function firstCallArg(
  mockFn: unknown,
  callIndex = 0,
  argIndex = 0,
): unknown {
  const fn = mockFn as { mock: { calls: unknown[][] } };
  return fn.mock.calls[callIndex][argIndex];
}

/**
 * Recover the literal value(s) passed to `eq()` / `inArray()` from a captured
 * `SQL` condition, so tests assert the exact filter list rather than just that
 * `where()` was called. Hoisted unchanged from players/teams specs.
 */
export function extractFilterValues(
  condition: unknown,
): string | number | (string | number)[] | undefined {
  if (!is(condition, SQL)) return undefined;
  for (const chunk of condition.queryChunks) {
    if (is(chunk, SQL)) {
      const nested = extractFilterValues(chunk);
      if (nested !== undefined) return nested;
    } else if (is(chunk, Param)) {
      return paramValue(chunk);
    } else if (Array.isArray(chunk)) {
      const values = chunk
        .filter((c): c is Param => is(c, Param))
        .map(paramValue);
      if (values.length > 0) return values;
    }
  }
  return undefined;
}

/**
 * Recover every literal value(s) passed to `eq()` / `inArray()` anywhere in a
 * captured `SQL` condition tree, in encounter order. Unlike `extractFilterValues`
 * (which stops at the first `Param`-bearing chunk it finds — the right choice for
 * a single-clause `where()`), this walks the whole tree, so it's the one to reach
 * a value buried inside an `and(...)` of several clauses — e.g. a type-list
 * `inArray()` combined with an optional `eq(teamEras.eraId, eraId)`. Mirrors how
 * `extractJoinColumns` walks the whole tree for `Column`s rather than stopping
 * at the first one.
 */
export function extractAllFilterValues(condition: unknown): unknown[] {
  const values: unknown[] = [];
  const walk = (node: unknown): void => {
    if (is(node, Param)) {
      values.push(paramValue(node));
    } else if (is(node, SQL)) {
      for (const chunk of node.queryChunks) walk(chunk);
    } else if (Array.isArray(node)) {
      for (const chunk of node) walk(chunk);
    }
  };
  walk(condition);
  return values;
}

/**
 * Recover the fully-qualified `"table.column"` names a join/filter condition
 * references, in encounter order. Given `eq(teamEras.id, players.teamEraId)`
 * returns `['team_eras.id', 'players.team_era_id']`. Walks the SQL queryChunks
 * for `Column` instances, mirroring how extractFilterValues walks for `Param`s.
 *
 * Uses drizzle's `is()` type guard rather than `instanceof` because the table
 * objects imported from `@blood-bowl-tracker/db` are constructed against that
 * package's compiled CJS `drizzle-orm` module instance, while this file (run
 * through Vitest/Vite as ESM) imports the ESM `drizzle-orm` module instance.
 * Those are two distinct copies of the `Column` class in Node's dual-package
 * hazard sense, so `instanceof Column` silently fails to match real columns.
 * `is()` instead compares a `Symbol.for('drizzle:entityKind')` tag, which is
 * shared across module instances via Node's global symbol registry.
 */
export function extractJoinColumns(condition: unknown): string[] {
  const columns: string[] = [];
  const walk = (node: unknown): void => {
    if (is(node, Column)) {
      columns.push(`${getTableName(getColumnTable(node))}.${node.name}`);
    } else if (is(node, SQL)) {
      for (const chunk of node.queryChunks) walk(chunk);
    } else if (Array.isArray(node)) {
      for (const chunk of node) walk(chunk);
    }
  };
  walk(condition);
  return columns;
}
