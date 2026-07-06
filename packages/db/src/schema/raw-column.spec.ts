import { describe, expect, it } from 'vitest';
import { getTableConfig, pgTable } from 'drizzle-orm/pg-core';
import { rawColumn } from './raw-column';

describe('rawColumn', () => {
  it('produces a column with the exact SQL type passed in config', () => {
    const table = pgTable('t', {
      name: rawColumn('name', { sqlType: 'varchar(300)' }),
      count: rawColumn('count', { sqlType: 'integer' }).notNull(),
    });
    const [name, count] = getTableConfig(table).columns;
    expect(name.getSQLType()).toBe('varchar(300)');
    expect(name.notNull).toBe(false);
    expect(count.getSQLType()).toBe('integer');
    expect(count.notNull).toBe(true);
  });
});
