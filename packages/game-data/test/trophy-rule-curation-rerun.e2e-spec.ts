import type { UpsertTrophy } from '@blood-bowl-tracker/api-contract';
import type { Db } from '@blood-bowl-tracker/db';
import {
  DB,
  externalSystems,
  leagues,
  trophies,
  trophiesHistory,
  trophyAwardRuleEligiblePositions,
  trophyAwardRuleEligiblePositionsHistory,
  trophyAwardRuleExcludedMatchEventTypes,
  trophyAwardRuleExcludedMatchEventTypesHistory,
  trophyAwardRuleMatchEventTypes,
  trophyAwardRuleMatchEventTypesHistory,
} from '@blood-bowl-tracker/db';
import {
  closeTestDb,
  resetGameDataTables,
} from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { LikePatternService } from '../src/shared/like-pattern.service';
import { TrophiesService } from '../src/trophies/trophies.service';
import { TrophyRuleCurationSyncService } from '../src/trophies/trophy-rule-curation-sync.service';
import { connectTestDb } from './e2e-database';

/**
 * Re-running the manual importer upserts every curated trophy again, with
 * its rule rows already in the database and already referenced by history
 * rows. These tests pin that such a re-run succeeds, writes nothing when
 * nothing changed, and soft-removes rather than deletes a dropped rule row.
 */

interface Fixtures {
  systemId: number;
  leagueId: number;
}

function topFouler(
  fixtures: Fixtures,
  overrides: Partial<UpsertTrophy> = {},
): UpsertTrophy {
  return {
    name: 'Top Fouler',
    recipientKind: 'player',
    description: null,
    competitionGroupId: null,
    leagueId: fixtures.leagueId,
    awardRuleKind: 'max_count',
    awardProcedure: null,
    awardRuleRole: 'acting',
    awardRuleTieCutoff: 4,
    awardRuleThreshold: null,
    awardRuleMeasure: null,
    awardRuleMatchEventTypes: [
      { actionType: 'foul' },
      { consequenceType: 'casualty' },
    ],
    awardRuleExcludedMatchEventTypes: [{ actionType: 'mvp_award' }],
    awardRuleEligiblePositions: [
      'Ogre: Ogre Blocker',
      'Ogre: Ogre Runt Punter',
    ],
    externalIds: [{ externalSystemId: fixtures.systemId, externalId: 'TF' }],
    ...overrides,
  };
}

/** Every trophy and rule row, current and historical. */
async function snapshot(db: Db): Promise<unknown[]> {
  return [
    await db.select().from(trophies),
    await db.select().from(trophiesHistory),
    await db.select().from(trophyAwardRuleMatchEventTypes),
    await db.select().from(trophyAwardRuleMatchEventTypesHistory),
    await db.select().from(trophyAwardRuleExcludedMatchEventTypes),
    await db.select().from(trophyAwardRuleExcludedMatchEventTypesHistory),
    await db.select().from(trophyAwardRuleEligiblePositions),
    await db.select().from(trophyAwardRuleEligiblePositionsHistory),
  ];
}

describe('trophy rule curation re-runs (real Postgres)', () => {
  let db: Db;
  let service: TrophiesService;
  let fixtures: Fixtures;

  const eligibleRows = () =>
    db
      .select({
        id: trophyAwardRuleEligiblePositions.id,
        positionNameExternalId:
          trophyAwardRuleEligiblePositions.positionNameExternalId,
        removed: trophyAwardRuleEligiblePositions.removed,
      })
      .from(trophyAwardRuleEligiblePositions)
      .orderBy(trophyAwardRuleEligiblePositions.positionNameExternalId);

  beforeAll(async () => {
    db = await connectTestDb();
  });

  afterAll(async () => {
    await closeTestDb(db);
  });

  beforeEach(async () => {
    await resetGameDataTables(db);
    const [system] = await db
      .insert(externalSystems)
      .values({ name: 'Manual', category: 'imported_data_source' })
      .returning();
    const [league] = await db
      .insert(leagues)
      .values({ name: 'Test League' })
      .returning();
    fixtures = { systemId: system.id, leagueId: league.id };
    const moduleRef = await Test.createTestingModule({
      providers: [
        TrophiesService,
        TrophyRuleCurationSyncService,
        { provide: LikePatternService, useValue: mock<LikePatternService>() },
        { provide: DB, useValue: db },
      ],
    }).compile();
    service = moduleRef.get(TrophiesService);
  });

  it('re-upserts an unchanged trophy whose rule rows have history, writing nothing', async () => {
    await service.upsert(topFouler(fixtures));
    const before = await snapshot(db);

    await service.upsert(topFouler(fixtures));

    expect(await snapshot(db)).toEqual(before);
  });

  it('flags a dropped eligible position removed and keeps its row', async () => {
    const { trophy } = await service.upsert(topFouler(fixtures));

    await service.upsert(
      topFouler(fixtures, {
        awardRuleEligiblePositions: ['Ogre: Ogre Blocker'],
      }),
    );

    expect(await eligibleRows()).toEqual([
      expect.objectContaining({
        positionNameExternalId: 'Ogre: Ogre Blocker',
        removed: false,
      }),
      expect.objectContaining({
        positionNameExternalId: 'Ogre: Ogre Runt Punter',
        removed: true,
      }),
    ]);
    const curation = await service.findAwardRuleCuration(trophy.id);
    expect(curation.eligiblePositions).toEqual(['Ogre Blocker']);
  });

  it('revives a re-listed eligible position instead of inserting a second row', async () => {
    await service.upsert(topFouler(fixtures));
    const original = await eligibleRows();
    await service.upsert(
      topFouler(fixtures, {
        awardRuleEligiblePositions: ['Ogre: Ogre Blocker'],
      }),
    );

    await service.upsert(topFouler(fixtures));

    expect(await eligibleRows()).toEqual(original);
  });

  it('flags every rule row removed when the trophy becomes non-computed', async () => {
    await service.upsert(topFouler(fixtures));

    await service.upsert(
      topFouler(fixtures, {
        awardRuleKind: 'manual',
        awardProcedure: 'Rolled by hand.',
        awardRuleRole: null,
        awardRuleTieCutoff: null,
      }),
    );

    const flags = [
      ...(await db
        .select({ removed: trophyAwardRuleMatchEventTypes.removed })
        .from(trophyAwardRuleMatchEventTypes)),
      ...(await db
        .select({ removed: trophyAwardRuleExcludedMatchEventTypes.removed })
        .from(trophyAwardRuleExcludedMatchEventTypes)),
      ...(await eligibleRows()),
    ].map((row) => row.removed);
    expect(flags).toEqual([true, true, true, true, true]);
  });
});
