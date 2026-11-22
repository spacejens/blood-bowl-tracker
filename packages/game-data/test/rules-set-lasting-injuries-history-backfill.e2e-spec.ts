/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Db } from '@blood-bowl-tracker/db';
import {
  asc,
  eq,
  rulesSets,
  rulesSetsHistory,
  sql,
} from '@blood-bowl-tracker/db';
import {
  closeTestDb,
  resetGameDataTables,
} from '@blood-bowl-tracker/db/test-helpers';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { connectTestDb } from './e2e-database';

const MIGRATIONS_DIR = join(__dirname, '../../db/migrations');

/**
 * Every statement of the add_rules_sets_lasting_injuries_never_heal migration
 * that writes to the history table, rather than adding a column.
 */
function historyBackfillStatements(): string[] {
  const folder = readdirSync(MIGRATIONS_DIR).find((name) =>
    name.endsWith('_add_rules_sets_lasting_injuries_never_heal'),
  );
  if (folder === undefined) {
    throw new Error(
      'No add_rules_sets_lasting_injuries_never_heal migration was found.',
    );
  }
  return readFileSync(join(MIGRATIONS_DIR, folder, 'migration.sql'), 'utf-8')
    .split('--> statement-breakpoint')
    .filter((statement) =>
      statement.includes('UPDATE "game_data"."rules_sets_history"'),
    );
}

async function runHistoryBackfill(db: Db): Promise<void> {
  for (const statement of historyBackfillStatements()) {
    await db.execute(sql.raw(statement));
  }
}

/**
 * The history rows the migration found: every row that existed before the
 * column was added holds NULL for it, while the live row holds the default.
 */
async function nullHistoryFlags(db: Db): Promise<void> {
  await db.execute(
    sql.raw(
      'UPDATE "game_data"."rules_sets_history" SET "lasting_injuries_never_heal" = NULL',
    ),
  );
}

interface HistoryRow {
  flag: boolean | null;
  open: boolean;
}

async function historyRows(db: Db, id: number): Promise<HistoryRow[]> {
  // History columns mirror the live table under their SQL names.
  return await db
    .select({
      flag: sql<
        boolean | null
      >`${rulesSetsHistory.lasting_injuries_never_heal}`,
      open: sql<boolean>`upper_inf(${rulesSetsHistory.historyPeriod})`,
    })
    .from(rulesSetsHistory)
    .where(eq(rulesSetsHistory.id, id))
    .orderBy(asc(rulesSetsHistory.historyVersion));
}

/**
 * The versioning trigger closes the previous history row by matching every
 * common column against the old live row, so a current history row left NULL
 * for the new column would never be closed by the first later update.
 */
describe('add_rules_sets_lasting_injuries_never_heal history backfill (real Postgres)', () => {
  let db: Db;
  let id: number;

  beforeAll(async () => {
    db = await connectTestDb();
  });

  afterAll(async () => {
    await closeTestDb(db);
  });

  beforeEach(async () => {
    await resetGameDataTables(db);
    const [rulesSet] = await db
      .insert(rulesSets)
      .values({ name: 'CRP' })
      .returning();
    id = rulesSet.id;
    await db
      .update(rulesSets)
      .set({ name: 'CRP (renamed)' })
      .where(eq(rulesSets.id, id));
    await nullHistoryFlags(db);
  });

  it('sets the current history row to the live flag and leaves closed rows NULL', async () => {
    await runHistoryBackfill(db);

    expect(await historyRows(db, id)).toEqual([
      { flag: null, open: false },
      { flag: false, open: true },
    ]);
  });

  it('leaves exactly one current history row after the flag is first updated', async () => {
    await runHistoryBackfill(db);

    await db
      .update(rulesSets)
      .set({ lastingInjuriesNeverHeal: true })
      .where(eq(rulesSets.id, id));

    expect(await historyRows(db, id)).toEqual([
      { flag: null, open: false },
      { flag: false, open: false },
      { flag: true, open: true },
    ]);
  });
});
