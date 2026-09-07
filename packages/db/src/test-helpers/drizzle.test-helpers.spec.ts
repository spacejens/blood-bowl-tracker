import { Column, is, Param, SQL, StringChunk } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import { describe, expect, it } from 'vitest';

import * as helpers from './drizzle.test-helpers.js';

/**
 * Test-only drizzle surface. Specs use `PgDialect` to render a captured
 * condition to SQL text, `drizzle().mock()` to build a query builder with no
 * connection, and `is`/`SQL`/`Column`/`Param`/`StringChunk` to walk a captured
 * condition tree. Reference identity is asserted for the same reason as the
 * main entry point's re-exports.
 */
describe('drizzle test-helper re-exports', () => {
  it.each([
    ['PgDialect', PgDialect],
    ['drizzle', drizzle],
    ['is', is],
    ['SQL', SQL],
    ['Column', Column],
    ['Param', Param],
    ['StringChunk', StringChunk],
  ])('re-exports %s', (name, original) => {
    expect((helpers as unknown as Record<string, unknown>)[name]).toBe(
      original,
    );
  });

  it('is reachable through the subpath entry point', async () => {
    const entry = await import('./db-mock.test-helpers.js');
    expect((entry as unknown as Record<string, unknown>).PgDialect).toBe(
      PgDialect,
    );
  });
});
