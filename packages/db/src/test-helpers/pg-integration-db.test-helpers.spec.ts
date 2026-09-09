import type { SQL } from 'drizzle-orm';
import type { Mock } from 'vitest';
import { describe, expect, it } from 'vitest';

import type { Db } from '../db.js';
import { mockDb } from './db-mock.test-helpers.js';
import { PgDialect } from './drizzle.test-helpers.js';
import { resetGameDataTables } from './pg-integration-db.test-helpers.js';

/**
 * The `SQL` values passed to `db.execute`, in call order. `mockDb`'s db is a
 * vitest-mock-extended proxy, so `execute` is a `Mock` that records its calls;
 * the cast is what makes those calls readable through the `Db` type.
 */
function executedQueries(db: Db): SQL[] {
  const execute = (db as unknown as { execute: Mock }).execute;
  return (execute.mock.calls as [SQL][]).map(([query]) => query);
}

describe('resetGameDataTables', () => {
  it('truncates every table the game_data catalog reports, in one statement', async () => {
    const { db } = mockDb([{ tablename: 'leagues' }, { tablename: 'eras' }]);

    await resetGameDataTables(db);

    const queries = executedQueries(db);
    expect(queries).toHaveLength(2);
    expect(new PgDialect().sqlToQuery(queries[1]).sql).toBe(
      'TRUNCATE TABLE "game_data"."leagues", "game_data"."eras" ' +
        'RESTART IDENTITY CASCADE',
    );
  });

  it('issues no truncate when the schema holds no tables', async () => {
    const { db } = mockDb([]);

    await resetGameDataTables(db);

    expect(executedQueries(db)).toHaveLength(1);
  });
});
