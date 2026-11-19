import type { UpsertTrophy } from '@blood-bowl-tracker/api-contract';
import type { Db } from '@blood-bowl-tracker/db';
import { DB, externalSystems, leagues, trophies } from '@blood-bowl-tracker/db';
import {
  closeTestDb,
  resetGameDataTables,
} from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { TrophiesService } from '../src/trophies/trophies.service';
import { TrophyRuleCurationSyncService } from '../src/trophies/trophy-rule-curation-sync.service';
import { connectTestDb } from './e2e-database';

/**
 * A trophy's grants_skill flag overlays like its other curated columns: a
 * new trophy that says nothing grants no skill, a stated value is stored,
 * and a later upsert that omits it keeps what is stored.
 */

interface Fixtures {
  systemId: number;
  leagueId: number;
}

function gudarnas(
  fixtures: Fixtures,
  overrides: Partial<UpsertTrophy> = {},
): UpsertTrophy {
  return {
    name: 'Gudarnas Förkämpe',
    recipientKind: 'player',
    description: null,
    competitionGroupId: null,
    leagueId: fixtures.leagueId,
    awardRuleKind: 'manual',
    awardProcedure: 'Rolled by hand.',
    awardRuleRole: null,
    awardRuleTieCutoff: null,
    awardRuleThreshold: null,
    awardRuleMeasure: null,
    externalIds: [{ externalSystemId: fixtures.systemId, externalId: 'GF' }],
    ...overrides,
  };
}

describe('trophy grants_skill (real Postgres)', () => {
  let db: Db;
  let service: TrophiesService;
  let fixtures: Fixtures;

  const stored = async (): Promise<boolean[]> =>
    (await db.select({ grantsSkill: trophies.grantsSkill }).from(trophies)).map(
      (row) => row.grantsSkill,
    );

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
        { provide: DB, useValue: db },
      ],
    }).compile();
    service = moduleRef.get(TrophiesService);
  });

  it('stores false for a new trophy whose upsert says nothing about a grant', async () => {
    await service.upsert(gudarnas(fixtures));

    expect(await stored()).toEqual([false]);
  });

  it('stores a stated grant and keeps it when a later upsert omits it', async () => {
    await service.upsert(gudarnas(fixtures, { grantsSkill: true }));
    await service.upsert(gudarnas(fixtures));

    expect(await stored()).toEqual([true]);
  });

  it('clears a grant an upsert states as false', async () => {
    await service.upsert(gudarnas(fixtures, { grantsSkill: true }));
    await service.upsert(gudarnas(fixtures, { grantsSkill: false }));

    expect(await stored()).toEqual([false]);
  });
});
