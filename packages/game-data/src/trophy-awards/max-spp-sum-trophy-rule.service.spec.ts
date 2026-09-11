import type { SQL } from '@blood-bowl-tracker/db';
import { DB, inArray, positions, sql } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { MatchScopeFilterService } from '../shared/match-scope-filter.service';
import {
  extractAllFilterValues,
  extractJoinColumns,
  firstCallArg,
  sqlText,
} from '../shared/query-assertions.test-helpers';
import { MaxSppSumTrophyRuleService } from './max-spp-sum-trophy-rule.service';
import { TrophyRuleEventTypeFilterService } from './trophy-rule-event-type-filter.service';
import { TrophyRulePositionFilterService } from './trophy-rule-position-filter.service';

/**
 * `positionCondition` is what the mocked position filter answers with for
 * this test: the filter builds part of a live SQL query, so it is stubbed
 * rather than provided for real, and its own behaviour — which curated list
 * maps to which condition — is asserted in its own spec. What these tests
 * check is that the rule hands the curated ids to the filter and splices
 * whatever comes back into the candidate query.
 */
async function makeService(
  rows: unknown[],
  positionCondition: SQL | undefined = undefined,
): Promise<{
  service: MaxSppSumTrophyRuleService;
  db: MockDbResult;
  positionFilter: MockProxy<TrophyRulePositionFilterService>;
}> {
  const db = mockDb(rows);
  const positionFilter = mock<TrophyRulePositionFilterService>();
  positionFilter.build.mockReturnValue(positionCondition);
  const moduleRef = await Test.createTestingModule({
    providers: [
      MaxSppSumTrophyRuleService,
      // Pure and dependency-free, so real — see CLAUDE.md's carve-out.
      TrophyRuleEventTypeFilterService,
      { provide: TrophyRulePositionFilterService, useValue: positionFilter },
      MatchScopeFilterService,
      { provide: DB, useValue: db.db },
    ],
  }).compile();
  return {
    service: moduleRef.get(MaxSppSumTrophyRuleService),
    db,
    positionFilter,
  };
}

const NO_TYPES = { actionTypes: [] as const, consequenceTypes: [] as const };

describe('MaxSppSumTrophyRuleService', () => {
  it('returns the single highest SPP sum', async () => {
    const { service } = await makeService([
      { playerId: 5, teamEraId: 50, eventCount: 61 },
      { playerId: 6, teamEraId: 60, eventCount: 12 },
    ]);

    const winners = await service.compute({
      competitionId: 3,
      role: 'acting',
      types: NO_TYPES,
      excludedTypes: NO_TYPES,
      eligiblePositionIds: undefined,
      tieCutoff: 4,
    });

    expect(winners).toEqual([{ playerId: 5, teamEraId: 50 }]);
  });

  it('returns every player of a tie exactly at the cutoff', async () => {
    const { service } = await makeService([
      { playerId: 1, teamEraId: 10, eventCount: 30 },
      { playerId: 2, teamEraId: 20, eventCount: 30 },
      { playerId: 3, teamEraId: 30, eventCount: 5 },
    ]);

    const winners = await service.compute({
      competitionId: 3,
      role: 'acting',
      types: NO_TYPES,
      excludedTypes: NO_TYPES,
      eligiblePositionIds: undefined,
      tieCutoff: 2,
    });

    expect(winners).toEqual([
      { playerId: 1, teamEraId: 10 },
      { playerId: 2, teamEraId: 20 },
    ]);
  });

  it('awards nobody when one more player ties than the cutoff allows', async () => {
    const { service } = await makeService([
      { playerId: 1, teamEraId: 10, eventCount: 30 },
      { playerId: 2, teamEraId: 20, eventCount: 30 },
      { playerId: 3, teamEraId: 30, eventCount: 30 },
    ]);

    const winners = await service.compute({
      competitionId: 3,
      role: 'acting',
      types: NO_TYPES,
      excludedTypes: NO_TYPES,
      eligiblePositionIds: undefined,
      tieCutoff: 2,
    });

    expect(winners).toEqual([]);
  });

  it('awards nobody when nobody scored any SPP', async () => {
    const { service } = await makeService([]);

    const winners = await service.compute({
      competitionId: 3,
      role: 'acting',
      types: NO_TYPES,
      excludedTypes: NO_TYPES,
      eligiblePositionIds: undefined,
      tieCutoff: 4,
    });

    expect(winners).toEqual([]);
  });

  it('excludes the curated exclusion types from the sum', async () => {
    const { service, db } = await makeService([]);

    await service.compute({
      competitionId: 9,
      role: 'acting',
      types: NO_TYPES,
      excludedTypes: { actionTypes: ['mvp_award'], consequenceTypes: [] },
      eligiblePositionIds: undefined,
      tieCutoff: 4,
    });

    const values = extractAllFilterValues(firstCallArg(db.chains[0].where));
    expect(values).toContain('mvp_award');
    expect(values).toContain(9);
  });

  it('narrows the candidate pool to a rule’s eligible positions', async () => {
    const { service, db, positionFilter } = await makeService(
      [],
      inArray(positions.id, [21, 22]),
    );

    await service.compute({
      competitionId: 9,
      role: 'acting',
      types: NO_TYPES,
      excludedTypes: NO_TYPES,
      // Bierhallenführer's two Ogre positions. A Gnoblar Lineman with a
      // higher sum is not a candidate at all, which is the whole point.
      eligiblePositionIds: [21, 22],
      tieCutoff: 4,
    });

    expect(positionFilter.build).toHaveBeenCalledWith([21, 22]);
    const where = firstCallArg(db.chains[0].where);
    expect(extractAllFilterValues(where)).toEqual(
      expect.arrayContaining([21, 22]),
    );
    expect(extractJoinColumns(where)).toContain('positions.id');
  });

  it('lets an unrestricted rule filter on no position at all', async () => {
    const { service, db, positionFilter } = await makeService([], undefined);

    await service.compute({
      competitionId: 9,
      role: 'acting',
      types: NO_TYPES,
      excludedTypes: NO_TYPES,
      eligiblePositionIds: undefined,
      tieCutoff: 4,
    });

    expect(positionFilter.build).toHaveBeenCalledWith(undefined);
    expect(extractJoinColumns(firstCallArg(db.chains[0].where))).not.toContain(
      'positions.id',
    );
  });

  it('awards nobody when a restriction resolved to no position at all', async () => {
    const { service, db, positionFilter } = await makeService([], sql`false`);

    await service.compute({
      competitionId: 9,
      role: 'acting',
      types: NO_TYPES,
      excludedTypes: NO_TYPES,
      eligiblePositionIds: [],
      tieCutoff: 4,
    });

    expect(positionFilter.build).toHaveBeenCalledWith([]);
    expect(sqlText(firstCallArg(db.chains[0].where))).toContain('false');
  });
});
