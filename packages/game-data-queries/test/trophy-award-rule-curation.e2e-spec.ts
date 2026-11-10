import 'reflect-metadata';

import type { Db } from '@blood-bowl-tracker/db';
import { DB, externalSystems, leagues } from '@blood-bowl-tracker/db';
import {
  closeTestDb,
  resetGameDataTables,
} from '@blood-bowl-tracker/db/test-helpers';
import { TrophiesModule, TrophiesService } from '@blood-bowl-tracker/game-data';
import type { DynamicModule } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { TrophiesQueriesModule } from '../src/trophies/trophies-queries.module';
import { TrophiesQueriesService } from '../src/trophies/trophies-queries.service';
import { connectTestDb } from './e2e-database';

class TestDbModule {}

/**
 * Provides the DB token globally, the way the application's DbModule does, so
 * the real TrophiesModule and TrophiesQueriesModule resolve it.
 */
function makeDbModule(db: Db): DynamicModule {
  return {
    module: TestDbModule,
    global: true,
    providers: [{ provide: DB, useValue: db }],
    exports: [DB],
  };
}

describe('TrophiesQueriesService.findAwardRuleCuration (real Postgres)', () => {
  let db: Db;
  let trophies: TrophiesService;
  let queries: TrophiesQueriesService;
  let systemId: number;
  let leagueId: number;

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
    systemId = system.id;
    leagueId = league.id;
    const moduleRef = await Test.createTestingModule({
      imports: [makeDbModule(db), TrophiesModule, TrophiesQueriesModule],
    }).compile();
    trophies = moduleRef.get(TrophiesService);
    queries = moduleRef.get(TrophiesQueriesService);
  });

  it('lists only the eligible positions that are not flagged removed', async () => {
    const trophy = {
      name: 'Top Fouler',
      recipientKind: 'player' as const,
      description: null,
      competitionGroupId: null,
      leagueId,
      awardRuleKind: 'max_count' as const,
      awardProcedure: null,
      awardRuleRole: 'acting' as const,
      awardRuleTieCutoff: 4,
      awardRuleThreshold: null,
      awardRuleMeasure: null,
      awardRuleMatchEventTypes: [{ actionType: 'foul' as const }],
      awardRuleExcludedMatchEventTypes: [],
      awardRuleEligiblePositions: [
        'Ogre: Ogre Blocker',
        'Ogre: Ogre Runt Punter',
      ],
      externalIds: [{ externalSystemId: systemId, externalId: 'TF' }],
    };
    const { trophy: created } = await trophies.upsert(trophy);
    await trophies.upsert({
      ...trophy,
      awardRuleEligiblePositions: ['Ogre: Ogre Blocker'],
    });

    const curation = await queries.findAwardRuleCuration(created.id);

    expect(curation.eligiblePositions).toEqual(['Ogre Blocker']);
  });
});
