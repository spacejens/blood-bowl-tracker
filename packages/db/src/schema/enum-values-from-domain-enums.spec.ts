import * as domainEnums from '@blood-bowl-tracker/domain-enums';
import { describe, expect, it } from 'vitest';

import * as db from './index';

/**
 * db enums and api-contract schemas both derive their values from
 * `@blood-bowl-tracker/domain-enums`, so a db enum cannot drift from its
 * api-contract counterpart — both sides import the same array.
 *
 * What is still possible, and uncaught by anything else, is a new db
 * enum built from a hand-rolled inline array instead of a domain-enums
 * export (e.g. `gameData.enum('new_thing', ['a', 'b'])` written directly in
 * a schema file). This spec guards against that.
 *
 * Ideally this would assert *referential* identity between a db enum's
 * `enumValues` and a domain-enums export — proving the array was passed
 * through, not copied. That is not achievable here: drizzle-orm's `pgEnum`/
 * `PgSchema.enum` both do `enumValues: [...input]` internally (see
 * `pg-core/columns/enum.ts` / `pg-core/schema.ts` in drizzle-orm), so
 * `enumValues` is a fresh array on every db enum, correctly-wired or not —
 * `toBe` against the original export fails universally, even for enums
 * built directly from a domain-enums import. The check below instead
 * asserts deep, order-sensitive equality (`toEqual`), which is the
 * strongest guarantee actually obtainable through drizzle's public API: it
 * still catches a hand-typed inline array whose values differ, are
 * reordered, or drift out of sync with domain-enums, which is the
 * completeness gap this spec exists to close.
 */

/** Anything shaped like a drizzle enum: it carries a string `enumValues` array. */
interface EnumLike {
  readonly enumValues: readonly string[];
}

/**
 * A drizzle PgEnum is a *callable* object (calling it builds a column), so
 * `typeof` is 'function', not 'object'. Both are accepted here; a guard that
 * only accepted 'object' would discover nothing and pass vacuously.
 */
const isEnumLike = (value: unknown): value is EnumLike => {
  if (typeof value !== 'object' && typeof value !== 'function') {
    return false;
  }
  if (value === null) {
    return false;
  }
  const candidate = (value as { enumValues?: unknown }).enumValues;
  return (
    Array.isArray(candidate) &&
    candidate.every((entry) => typeof entry === 'string')
  );
};

/** Every export of packages/db's own index that looks like a drizzle enum. */
const dbEnums: ReadonlyArray<readonly [string, EnumLike]> = Object.entries(
  db as Record<string, unknown>,
)
  .filter((entry): entry is [string, EnumLike] => isEnumLike(entry[1]))
  .sort((a, b) => a[0].localeCompare(b[0]));

/** Anything shaped like a domain-enums `as const` string array. */
const isStringArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string');

/**
 * String-array exports of domain-enums that are deliberately not db enums:
 * a curated subset of `ACTION_TYPES` that api-contract and game-data consume,
 * stored in no enum column.
 */
const NOT_DB_ENUMS: ReadonlySet<string> = new Set(['SPP_EARNING_ACTION_TYPES']);

/** Every export of `@blood-bowl-tracker/domain-enums` that is a string array. */
const domainEnumExports: ReadonlyArray<readonly [string, readonly string[]]> =
  Object.entries(domainEnums as Record<string, unknown>)
    .filter(
      (entry): entry is [string, readonly string[]] =>
        isStringArray(entry[1]) && !NOT_DB_ENUMS.has(entry[0]),
    )
    .sort((a, b) => a[0].localeCompare(b[0]));

/** Order-sensitive value equality between two string arrays. */
const sameValues = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((entry, i) => entry === b[i]);

describe('db enum discovery', () => {
  it('finds at least one db enum and one domain-enums export', () => {
    // Guards against both lists silently discovering nothing (e.g. an
    // isEnumLike/isStringArray regression), which would make every
    // assertion below pass vacuously.
    expect(dbEnums.length).toBeGreaterThan(0);
    expect(domainEnumExports.length).toBeGreaterThan(0);
  });
});

describe('db enums are built from domain-enums exports', () => {
  it.each(dbEnums)(
    '%s.enumValues matches one of the domain-enums exports exactly',
    (name, dbEnum) => {
      const match = domainEnumExports.find(([, values]) =>
        sameValues(dbEnum.enumValues, values),
      );
      expect(
        match,
        `${name}.enumValues does not match any @blood-bowl-tracker/domain-enums ` +
          `export by value — it looks like it was built from a hand-rolled ` +
          `inline array instead of importing a shared domain-enums constant.`,
      ).toBeDefined();
    },
  );
});

describe('every domain-enums export is used by a db enum', () => {
  it.each(domainEnumExports)(
    '%s is used by at least one db enum',
    (name, values) => {
      const match = dbEnums.find(([, dbEnum]) =>
        sameValues(dbEnum.enumValues, values),
      );
      expect(
        match,
        `${name} in @blood-bowl-tracker/domain-enums is not used by any ` +
          `db enum in packages/db — if this is intentional (e.g. it is only ` +
          `consumed by api-contract/review-harness/parse-tp), this check ` +
          `needs adjusting; if not, it is an orphaned constant.`,
      ).toBeDefined();
    },
  );
});
