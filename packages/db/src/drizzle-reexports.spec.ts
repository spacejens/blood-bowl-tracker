import {
  and,
  asc,
  between,
  count,
  countDistinct,
  desc,
  eq,
  exists,
  getColumnTable,
  getTableColumns,
  getTableName,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  max,
  min,
  ne,
  or,
  sql,
  sum,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import * as db from './index';

/**
 * `packages/db` is the only workspace allowed to depend on drizzle-orm (see
 * `dependency-boundary.spec.ts`), so every operator its consumers need has to
 * be reachable through this package's public entry point. Asserting reference
 * identity — not merely "is defined" — means a re-export accidentally bound to
 * the wrong symbol fails here rather than silently changing a consumer's query.
 */
describe('drizzle re-exports from the main entry point', () => {
  it.each([
    ['and', and],
    ['or', or],
    ['eq', eq],
    ['ne', ne],
    ['inArray', inArray],
    ['isNull', isNull],
    ['isNotNull', isNotNull],
    ['ilike', ilike],
    ['gt', gt],
    ['gte', gte],
    ['lt', lt],
    ['between', between],
    ['asc', asc],
    ['desc', desc],
    ['count', count],
    ['countDistinct', countDistinct],
    ['sum', sum],
    ['min', min],
    ['max', max],
    ['exists', exists],
    ['sql', sql],
    ['getTableColumns', getTableColumns],
    ['getTableName', getTableName],
    ['getColumnTable', getColumnTable],
    ['alias', alias],
  ])('re-exports %s', (name, original) => {
    expect((db as unknown as Record<string, unknown>)[name]).toBe(original);
  });
});
