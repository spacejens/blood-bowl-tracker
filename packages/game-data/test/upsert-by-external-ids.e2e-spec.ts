import type { Db } from '@blood-bowl-tracker/db';
import {
  eraExternalIds,
  eras,
  erasHistory,
  externalSystems,
  leagues,
} from '@blood-bowl-tracker/db';
import {
  closeTestDb,
  resetGameDataTables,
} from '@blood-bowl-tracker/db/test-helpers';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { UpsertByExternalIdsOptions } from '../src/shared/upsert-by-external-ids';
import { upsertByExternalIds } from '../src/shared/upsert-by-external-ids';
import { UpsertConflictError } from '../src/shared/upsert-conflict-error';
import { connectTestDb } from './e2e-database';

/** Stand-in for a real entity's conflict subclass; `eras` is the entity under test. */
class TestUpsertConflictError extends UpsertConflictError {}

interface ExternalIdFixtures {
  leagueId: number;
  externalSystemId: number;
}

async function seedExternalIdFixtures(db: Db): Promise<ExternalIdFixtures> {
  const [league] = await db
    .insert(leagues)
    .values({ name: 'Test League' })
    .returning();
  const [system] = await db
    .insert(externalSystems)
    .values({ name: 'Test System', category: 'imported_data_source' })
    .returning();
  return { leagueId: league.id, externalSystemId: system.id };
}

/**
 * The `eras` flavour of the shared options, with everything but the external
 * ids and the values fixed. Written as a factory rather than repeated per
 * test so each test shows only what it varies.
 */
function eraUpsertOptions(
  db: Db,
  values: { name: string; leagueId: number; startDate: string },
  externalIds: { externalSystemId: number; externalId: string }[],
): UpsertByExternalIdsOptions<typeof eras, typeof eraExternalIds> {
  return {
    db,
    entityTable: eras,
    entityIdColumn: eras.id,
    values,
    externalIdTable: eraExternalIds,
    ownerIdColumn: eraExternalIds.eraId,
    externalSystemIdColumn: eraExternalIds.externalSystemId,
    externalIdColumn: eraExternalIds.externalId,
    externalIds,
    ConflictErrorClass: TestUpsertConflictError,
    entityLabelPlural: 'eras',
    buildExternalIdRow: (eraId, pair) => ({ eraId, ...pair }),
  };
}

describe('upsertByExternalIds (real Postgres)', () => {
  let db: Db;
  let fixtures: ExternalIdFixtures;

  beforeAll(async () => {
    db = await connectTestDb();
  });

  afterAll(async () => {
    await closeTestDb(db);
  });

  beforeEach(async () => {
    await resetGameDataTables(db);
    fixtures = await seedExternalIdFixtures(db);
  });

  it('creates the entity and its external id rows on a first import', async () => {
    const { row, created } = await upsertByExternalIds(
      eraUpsertOptions(
        db,
        {
          name: 'Season One',
          leagueId: fixtures.leagueId,
          startDate: '2020-01-01',
        },
        [{ externalSystemId: fixtures.externalSystemId, externalId: 'era-1' }],
      ),
    );

    expect(created).toBe(true);
    expect(row.name).toBe('Season One');
    expect(await db.select().from(eras)).toHaveLength(1);
    expect(await db.select().from(eraExternalIds)).toHaveLength(1);
  });

  it('reconciles onto the row an existing external id already names', async () => {
    const [existing] = await db
      .insert(eras)
      .values({
        name: 'Old Name',
        leagueId: fixtures.leagueId,
        startDate: '2020-01-01',
      })
      .returning();
    await db.insert(eraExternalIds).values({
      eraId: existing.id,
      externalSystemId: fixtures.externalSystemId,
      externalId: 'era-1',
    });

    const { row, created } = await upsertByExternalIds(
      eraUpsertOptions(
        db,
        {
          name: 'New Name',
          leagueId: fixtures.leagueId,
          startDate: '2020-01-01',
        },
        [{ externalSystemId: fixtures.externalSystemId, externalId: 'era-1' }],
      ),
    );

    expect(created).toBe(false);
    expect(row.id).toBe(existing.id);
    expect(row.name).toBe('New Name');
    // No second, orphaned era row, and the real history trigger versioned the
    // update rather than erroring on it.
    expect(await db.select().from(eras)).toHaveLength(1);
    expect(row.historyVersion).toBe(2);
    expect(await db.select().from(erasHistory)).not.toHaveLength(0);
  });

  it('retries a real unique violation on the join table and rolls the entity back', async () => {
    // Two identical pairs in one call make insertMissingExternalIds issue a
    // single INSERT whose own two rows collide, so Postgres raises a genuine
    // 23505 on eras_external_ids. That is the real driver error shape
    // isExternalIdUniqueViolation has to unwrap out of DrizzleQueryError; if
    // it failed to recognise it, the raw driver error would surface here
    // instead of the after-N-attempts message.
    const pair = {
      externalSystemId: fixtures.externalSystemId,
      externalId: 'era-dup',
    };

    await expect(
      upsertByExternalIds(
        eraUpsertOptions(
          db,
          {
            name: 'Doomed',
            leagueId: fixtures.leagueId,
            startDate: '2020-01-01',
          },
          [pair, pair],
        ),
      ),
    ).rejects.toThrow(/after 3 attempts/);

    // Every attempt ran in its own transaction, so nothing was committed.
    expect(await db.select().from(eras)).toHaveLength(0);
    expect(await db.select().from(eraExternalIds)).toHaveLength(0);
  });

  it('rethrows a violation that is not the external-id race, without retrying', async () => {
    const missingSystemId = 999_999;

    // The top-level rejection is drizzle's own `DrizzleQueryError`, whose
    // message is just "Failed query: ...", not the driver's message — so
    // assert on the wrapped `.cause` (the real `postgres` error) instead.
    // What matters for this test is that it is a real 23503 rethrown
    // immediately, not the `after 3 attempts` retry-exhaustion message a
    // misclassified violation would produce instead.
    let caught: unknown;
    try {
      await upsertByExternalIds(
        eraUpsertOptions(
          db,
          {
            name: 'Doomed',
            leagueId: fixtures.leagueId,
            startDate: '2020-01-01',
          },
          [{ externalSystemId: missingSystemId, externalId: 'era-1' }],
        ),
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).not.toMatch(/after 3 attempts/);
    expect((caught as { cause?: { message?: string } }).cause?.message).toMatch(
      /violates foreign key constraint/,
    );

    expect(await db.select().from(eras)).toHaveLength(0);
  });
});
