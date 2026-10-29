import type { PositionRulesSetSkillCategoriesEntry } from '@blood-bowl-tracker/api-contract';
import type { Db } from '@blood-bowl-tracker/db';
import {
  DB,
  positionRulesSets,
  positionRulesSetSkillCategories,
  positions,
  rulesSets,
} from '@blood-bowl-tracker/db';
import {
  closeTestDb,
  resetGameDataTables,
} from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PositionRulesSetSkillCategoriesService } from '../src/position-rules-set-skill-categories/position-rules-set-skill-categories.service';
import { connectTestDb } from './e2e-database';

type Categories = PositionRulesSetSkillCategoriesEntry['primary'];

describe('PositionRulesSetSkillCategoriesService.sync (real Postgres)', () => {
  let db: Db;
  let service: PositionRulesSetSkillCategoriesService;
  let positionId: number;
  let rulesSetId: number;

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
    const [position] = await db
      .insert(positions)
      .values({ name: 'Lineman', isStarPlayer: false })
      .returning();
    positionId = position.id;
    await db.insert(positionRulesSets).values({
      positionId,
      rulesSetId,
      move: 6,
      strength: 3,
      agility: 3,
      passing: 4,
      armour: 9,
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        PositionRulesSetSkillCategoriesService,
        { provide: DB, useValue: db },
      ],
    }).compile();
    service = moduleRef.get(PositionRulesSetSkillCategoriesService);
  });

  const sync = (primary: Categories, secondary: Categories) =>
    service.sync({
      entries: [{ positionId, rulesSetId, primary, secondary }],
    });

  const row = async (skillCategory: string) =>
    (await db.select().from(positionRulesSetSkillCategories)).find(
      (r) => r.skillCategory === skillCategory,
    );

  it('an unchanged re-sync writes no new history version', async () => {
    await sync(['general'], ['agility', 'strength']);
    await sync(['general'], ['agility', 'strength']);

    const rows = await db.select().from(positionRulesSetSkillCategories);
    expect(rows.map((r) => r.historyVersion)).toEqual([1, 1, 1]);
  });

  it('flags a dropped category removed, then revives it, without deleting', async () => {
    await sync(['general'], ['strength']);
    await sync(['general'], []);
    expect((await row('strength'))?.removed).toBe(true);

    await sync(['general'], ['strength']);
    expect(
      await db.select().from(positionRulesSetSkillCategories),
    ).toHaveLength(2);
    expect(await row('strength')).toMatchObject({
      removed: false,
      historyVersion: 3,
    });
  });

  it('moves a category from secondary to primary in place', async () => {
    await sync(['general'], ['agility']);
    await sync(['general', 'agility'], []);

    expect(await row('agility')).toMatchObject({
      access: 'primary',
      historyVersion: 2,
    });
  });
});
