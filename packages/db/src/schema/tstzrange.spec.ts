import { describe, expect, it } from 'vitest';
import { getTableConfig, pgTable } from 'drizzle-orm/pg-core';
import { tstzrange } from './tstzrange';

describe('tstzrange', () => {
  it('produces a column with SQL type tstzrange', () => {
    const table = pgTable('t', {
      period: tstzrange('period').notNull(),
    });
    const [column] = getTableConfig(table).columns;
    expect(column.getSQLType()).toBe('tstzrange');
    expect(column.notNull).toBe(true);
  });
});
