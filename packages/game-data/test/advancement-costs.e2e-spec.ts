import type { Db } from '@blood-bowl-tracker/db';
import {
  advancementCosts,
  DB,
  leagues,
  rulesSets,
  skills,
} from '@blood-bowl-tracker/db';
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

  async function seedLeagueAndSkill(): Promise<{
    leagueId: number;
    skillId: number;
  }> {
    const [league] = await db
      .insert(leagues)
      .values({ name: 'tLoEG' })
      .returning();
    const [skill] = await db
      .insert(skills)
      .values({ name: 'Fan Favourite' })
      .returning();
    return { leagueId: league.id, skillId: skill.id };
  }

  const grantedSkillCost = (leagueId: number, skillId: number) => ({
    rulesSetId,
    leagueId,
    advancementNumber: 7,
    advancementKind: 'granted_skill' as const,
    skillId,
    sppCost: 125,
  });

  it('stores a league granted-skill cost beside the rules-set costs and re-syncs it in place', async () => {
    const { leagueId, skillId } = await seedLeagueAndSkill();
    const leagueCost = grantedSkillCost(leagueId, skillId);
    await service.sync({
      costs: [...costs([6, 10, 15, 20, 25, 100]), leagueCost],
    });
    const second = await service.sync({ costs: [leagueCost] });

    const rows = await db.select().from(advancementCosts);
    expect(rows).toHaveLength(7);
    const leagueRow = rows.find((row) => row.leagueId === leagueId);
    expect(leagueRow).toMatchObject({
      skillId,
      sppCost: 125,
      historyVersion: 1,
    });
    expect(second.advancementCostIds).toEqual([leagueRow!.id]);
    expect(rows.filter((row) => row.leagueId === null)).toHaveLength(6);
  });

  it('keeps a league cost apart from the rules-set cost with the same number and kind', async () => {
    const { leagueId } = await seedLeagueAndSkill();
    await service.sync({ costs: costs([6]) });
    await service.sync({ costs: [{ ...costs([9])[0], leagueId }] });

    const rows = await db.select().from(advancementCosts);
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.leagueId === null)?.sppCost).toBe(6);
    expect(rows.find((row) => row.leagueId === leagueId)?.sppCost).toBe(9);
  });

  it('rejects an unknown league and writes nothing', async () => {
    const { skillId } = await seedLeagueAndSkill();
    await expect(
      service.sync({ costs: [grantedSkillCost(999_999, skillId)] }),
    ).rejects.toBeInstanceOf(AdvancementCostValidationError);
    expect(await db.select().from(advancementCosts)).toHaveLength(0);
  });

  it('rejects an unknown skill and writes nothing', async () => {
    const { leagueId } = await seedLeagueAndSkill();
    await expect(
      service.sync({ costs: [grantedSkillCost(leagueId, 999_999)] }),
    ).rejects.toBeInstanceOf(AdvancementCostValidationError);
    expect(await db.select().from(advancementCosts)).toHaveLength(0);
  });

  it('the service rejects a granted_skill cost without a skill and a skill on another kind', async () => {
    const { leagueId, skillId } = await seedLeagueAndSkill();
    const { skillId: _omitted, ...withoutSkill } = grantedSkillCost(
      leagueId,
      skillId,
    );
    await expect(
      service.sync({ costs: [withoutSkill] }),
    ).rejects.toBeInstanceOf(AdvancementCostValidationError);
    await expect(
      service.sync({ costs: [{ ...costs([6])[0], skillId }] }),
    ).rejects.toBeInstanceOf(AdvancementCostValidationError);
    expect(await db.select().from(advancementCosts)).toHaveLength(0);
  });

  it('the database rejects a granted_skill row without a skill and a table_roll row with one', async () => {
    const { skillId } = await seedLeagueAndSkill();
    const base = { rulesSetId, advancementNumber: 7, sppCost: 125 };
    await expect(
      db
        .insert(advancementCosts)
        .values({ ...base, advancementKind: 'granted_skill' }),
    ).rejects.toMatchObject({
      cause: { constraint_name: 'advancement_costs_skill_matches_kind' },
    });
    await expect(
      db
        .insert(advancementCosts)
        .values({ ...base, advancementKind: 'table_roll', skillId }),
    ).rejects.toMatchObject({
      cause: { constraint_name: 'advancement_costs_skill_matches_kind' },
    });
  });

  it('the database treats a null league as a value: duplicates are rejected, a league row is allowed beside it', async () => {
    const { leagueId } = await seedLeagueAndSkill();
    const row = {
      rulesSetId,
      advancementNumber: 1,
      advancementKind: 'table_roll' as const,
      sppCost: 6,
    };
    await db.insert(advancementCosts).values(row);
    await expect(db.insert(advancementCosts).values(row)).rejects.toMatchObject(
      {
        cause: {
          constraint_name:
            'advancement_costs_rules_set_league_number_kind_unique',
        },
      },
    );
    await db.insert(advancementCosts).values({ ...row, leagueId });
    await expect(
      db.insert(advancementCosts).values({ ...row, leagueId }),
    ).rejects.toMatchObject({
      cause: {
        constraint_name:
          'advancement_costs_rules_set_league_number_kind_unique',
      },
    });
    expect(await db.select().from(advancementCosts)).toHaveLength(2);
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
