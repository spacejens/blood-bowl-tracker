import type { Db } from '@blood-bowl-tracker/db';
import { advancementCosts, DB, rulesSets } from '@blood-bowl-tracker/db';
import {
  closeTestDb,
  resetGameDataTables,
} from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AdvancementCostValidationError } from '../src/shared/advancement-cost-validation-error';
import { AdvancementCostsService } from '../src/spp/advancement-costs.service';
import { connectTestDb } from './e2e-database';

describe('AdvancementCostsService.sync (real Postgres)', () => {
  let db: Db;
  let service: AdvancementCostsService;
  let rulesSetId: number;

  const costs = (sppCosts: number[]) =>
    sppCosts.map((sppCost, index) => ({
      rulesSetId,
      advancementNumber: index + 1,
      advancementKind: 'table_roll' as const,
      sppCost,
    }));

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
      .values({ name: 'Test Rules' })
      .returning();
    rulesSetId = rulesSet.id;
    const moduleRef = await Test.createTestingModule({
      providers: [AdvancementCostsService, { provide: DB, useValue: db }],
    }).compile();
    service = moduleRef.get(AdvancementCostsService);
  });

  it('re-syncing the same natural key updates the row in place', async () => {
    const first = await service.sync({ costs: costs([6]) });
    // With ON CONFLICT the history trigger would break this second call.
    const second = await service.sync({ costs: costs([7]) });

    expect(second.advancementCostIds).toEqual(first.advancementCostIds);
    const rows = await db.select().from(advancementCosts);
    expect(rows).toHaveLength(1);
    expect(rows[0].sppCost).toBe(7);
    expect(rows[0].historyVersion).toBe(2);
  });

  it('an unchanged re-sync is idempotent and writes no new history version', async () => {
    const batch = { costs: costs([6, 10, 15, 20, 25, 100]) };
    const first = await service.sync(batch);
    const second = await service.sync(batch);

    expect([...second.advancementCostIds].sort()).toEqual(
      [...first.advancementCostIds].sort(),
    );
    const rows = await db.select().from(advancementCosts);
    expect(rows).toHaveLength(6);
    expect(rows.every((row) => row.historyVersion === 1)).toBe(true);
  });

  it('rejects an unknown rules set and writes nothing', async () => {
    await expect(
      service.sync({
        costs: [
          {
            rulesSetId: rulesSetId + 1000,
            advancementNumber: 1,
            advancementKind: 'table_roll',
            sppCost: 6,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(AdvancementCostValidationError);
    expect(await db.select().from(advancementCosts)).toHaveLength(0);
  });

  it('rejects a duplicate natural key and writes nothing', async () => {
    await expect(
      service.sync({ costs: [...costs([6]), ...costs([7])] }),
    ).rejects.toBeInstanceOf(AdvancementCostValidationError);
    expect(await db.select().from(advancementCosts)).toHaveLength(0);
  });

  it.each([
    [
      'a zero SPP cost',
      { advancementNumber: 1, sppCost: 0 },
      'advancement_costs_spp_cost_positive',
    ],
    [
      'a negative SPP cost',
      { advancementNumber: 1, sppCost: -6 },
      'advancement_costs_spp_cost_positive',
    ],
    [
      'a zero advancement number',
      { advancementNumber: 0, sppCost: 6 },
      'advancement_costs_advancement_number_positive',
    ],
  ])('the database rejects %s', async (_label, values, constraint) => {
    await expect(
      db.insert(advancementCosts).values({
        rulesSetId,
        advancementKind: 'table_roll',
        ...values,
      }),
    ).rejects.toMatchObject({ cause: { constraint_name: constraint } });
  });
});
