import type { Db } from '@blood-bowl-tracker/db';
import { DB, races, rulesSets, sppAwardValues } from '@blood-bowl-tracker/db';
import {
  closeTestDb,
  resetGameDataTables,
} from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { SppAwardValuesService } from '../src/spp/spp-award-values.service';
import { connectTestDb } from './e2e-database';

interface SppFixtures {
  rulesSetId: number;
  raceId: number;
}

async function seedSppFixtures(db: Db): Promise<SppFixtures> {
  const [rulesSet] = await db
    .insert(rulesSets)
    .values({ name: 'Test Rules' })
    .returning();
  const [race] = await db
    .insert(races)
    .values({ name: 'Test Race' })
    .returning();
  return { rulesSetId: rulesSet.id, raceId: race.id };
}

describe('SppAwardValuesService.sync (real Postgres)', () => {
  let db: Db;
  let service: SppAwardValuesService;
  let fixtures: SppFixtures;

  beforeAll(async () => {
    db = await connectTestDb();
  });

  afterAll(async () => {
    await closeTestDb(db);
  });

  beforeEach(async () => {
    await resetGameDataTables(db);
    fixtures = await seedSppFixtures(db);
    const moduleRef = await Test.createTestingModule({
      providers: [SppAwardValuesService, { provide: DB, useValue: db }],
    }).compile();
    service = moduleRef.get(SppAwardValuesService);
  });

  it('re-seeding the same natural key updates the row in place', async () => {
    const first = await service.sync({
      values: [
        {
          rulesSetId: fixtures.rulesSetId,
          raceId: null,
          actionType: 'touchdown',
          sppValue: 3,
        },
      ],
    });

    // The re-seed is the case the service's doc comment is about: with
    // ON CONFLICT DO UPDATE the history trigger would write a history row
    // keyed by a serial id that never reaches spp_award_values, and the
    // batch would fail on its FK. Select-first must simply update.
    const second = await service.sync({
      values: [
        {
          rulesSetId: fixtures.rulesSetId,
          raceId: null,
          actionType: 'touchdown',
          sppValue: 4,
        },
      ],
    });

    expect(second.sppAwardValueIds).toEqual(first.sppAwardValueIds);

    const rows = await db.select().from(sppAwardValues);
    expect(rows).toHaveLength(1);
    expect(rows[0].sppValue).toBe(4);
    expect(rows[0].historyVersion).toBe(2);
  });

  it('keeps a race override and its baseline as two rows across re-seeds', async () => {
    const values = [
      {
        rulesSetId: fixtures.rulesSetId,
        raceId: null,
        actionType: 'touchdown' as const,
        sppValue: 3,
      },
      {
        rulesSetId: fixtures.rulesSetId,
        raceId: fixtures.raceId,
        actionType: 'touchdown' as const,
        sppValue: 5,
      },
    ];

    const first = await service.sync({ values });
    const second = await service.sync({ values });

    // NULLS NOT DISTINCT makes the null-race baseline unique per
    // (rules set, action type) while still leaving room for the override.
    expect(first.sppAwardValueIds).toHaveLength(2);
    expect([...second.sppAwardValueIds].sort()).toEqual(
      [...first.sppAwardValueIds].sort(),
    );
    expect(await db.select().from(sppAwardValues)).toHaveLength(2);
  });

  it('writes nothing for an empty batch', async () => {
    const result = await service.sync({ values: [] });

    expect(result.sppAwardValueIds).toEqual([]);
    expect(await db.select().from(sppAwardValues)).toHaveLength(0);
  });
});
