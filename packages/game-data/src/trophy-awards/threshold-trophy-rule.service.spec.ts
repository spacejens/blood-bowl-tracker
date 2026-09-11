import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { MatchScopeFilterService } from '../shared/match-scope-filter.service';
import { extractAllFilterValues, firstCallArg } from '../shared/query-assertions.test-helpers';
import { CareerThresholdTrophyRuleService } from './threshold-trophy-rule.service';
import { TrophyRuleEventTypeFilterService } from './trophy-rule-event-type-filter.service';

/**
 * The service issues two queries: candidates at or over the threshold, then
 * the players already holding this trophy. Seeded in that order.
 */
async function makeService(
  candidates: unknown[],
  alreadyAwarded: unknown[] = [],
): Promise<{ service: CareerThresholdTrophyRuleService; db: MockDbResult }> {
  const db = mockDb(candidates, alreadyAwarded);
  const moduleRef = await Test.createTestingModule({
    providers: [
      CareerThresholdTrophyRuleService,
      TrophyRuleEventTypeFilterService,
      MatchScopeFilterService,
      { provide: DB, useValue: db.db },
    ],
  }).compile();
  return { service: moduleRef.get(CareerThresholdTrophyRuleService), db };
}

const SPP_OPTIONS = {
  trophyId: 40,
  leagueId: 1,
  role: 'acting',
  types: { actionTypes: [], consequenceTypes: [] },
  threshold: 176,
  measure: 'spp_sum',
} as const;

describe('CareerThresholdTrophyRuleService', () => {
  it('returns every qualifying player, not just the top one', async () => {
    const { service } = await makeService([
      { playerId: 1, teamEraId: 10 },
      { playerId: 2, teamEraId: 20 },
    ]);

    expect(await service.compute(SPP_OPTIONS)).toEqual([
      { playerId: 1, teamEraId: 10 },
      { playerId: 2, teamEraId: 20 },
    ]);
  });

  it('returns nobody when no player reaches the threshold', async () => {
    const { service } = await makeService([]);

    expect(await service.compute(SPP_OPTIONS)).toEqual([]);
  });

  it('drops a player who already won this trophy in an earlier competition', async () => {
    const { service } = await makeService(
      [
        { playerId: 1, teamEraId: 10 },
        { playerId: 2, teamEraId: 20 },
      ],
      [{ playerId: 1 }],
    );

    expect(await service.compute(SPP_OPTIONS)).toEqual([
      { playerId: 2, teamEraId: 20 },
    ]);
  });

  it('scopes the candidate query to the league, not to one competition', async () => {
    const { service, db } = await makeService([]);

    await service.compute(SPP_OPTIONS);

    const whereValues = extractAllFilterValues(firstCallArg(db.chains[0].where));
    expect(whereValues).toContain(1);

    const havingValues = extractAllFilterValues(firstCallArg(db.chains[0].having));
    expect(havingValues).toContain(176);
  });

  it('counts events instead of summing SPP for an event_count measure', async () => {
    const { service, db } = await makeService([]);

    await service.compute({
      trophyId: 41,
      leagueId: 1,
      role: 'consequence',
      types: { actionTypes: [], consequenceTypes: ['casualty', 'death'] },
      threshold: 3,
      measure: 'event_count',
    });

    const whereValues = extractAllFilterValues(firstCallArg(db.chains[0].where));
    expect(whereValues).toContain('casualty');
    expect(whereValues).toContain('death');

    const havingValues = extractAllFilterValues(firstCallArg(db.chains[0].having));
    expect(havingValues).toContain(3);
  });
});
