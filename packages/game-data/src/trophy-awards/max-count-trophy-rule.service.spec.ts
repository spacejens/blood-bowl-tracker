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
import { MaxCountTrophyRuleService } from './max-count-trophy-rule.service';
import { TrophyRuleEventTypeFilterService } from './trophy-rule-event-type-filter.service';
import { TrophyRulePositionFilterService } from './trophy-rule-position-filter.service';

/**
 * Per-test factory rather than a `beforeEach` subject: every test seeds the
 * mocked database with different candidate rows, and those rows have to exist
 * before the service is built.
 *
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
  service: MaxCountTrophyRuleService;
  db: MockDbResult;
  positionFilter: MockProxy<TrophyRulePositionFilterService>;
}> {
  const db = mockDb(rows);
  const positionFilter = mock<TrophyRulePositionFilterService>();
  positionFilter.build.mockReturnValue(positionCondition);
  const moduleRef = await Test.createTestingModule({
    providers: [
      MaxCountTrophyRuleService,
      // The event-type filter is a pure, dependency-free condition builder
      // with no I/O or external state, so it is provided for real — see
      // CLAUDE.md's carve-out. Mocking it would leave the captured event-type
      // conditions unasserted, which is the point of these tests.
      TrophyRuleEventTypeFilterService,
      // The position filter is mocked instead: it builds part of a live SQL
      // query, concrete behaviour these tests could drift from, and it is
      // asserted in its own spec.
      { provide: TrophyRulePositionFilterService, useValue: positionFilter },
      MatchScopeFilterService,
      { provide: DB, useValue: db.db },
    ],
  }).compile();
  return {
    service: moduleRef.get(MaxCountTrophyRuleService),
    db,
    positionFilter,
  };
}

const TOUCHDOWNS = {
  actionTypes: ['touchdown'] as const,
  consequenceTypes: [] as const,
};

describe('MaxCountTrophyRuleService', () => {
  it('returns the single top counter', async () => {
    const { service } = await makeService([
      { playerId: 7, teamEraId: 70, eventCount: 9 },
      { playerId: 8, teamEraId: 80, eventCount: 4 },
    ]);

    const winners = await service.compute({
      competitionId: 3,
      role: 'acting',
      types: TOUCHDOWNS,
      eligiblePositionIds: undefined,
      tieCutoff: 4,
    });

    expect(winners).toEqual([{ playerId: 7, teamEraId: 70 }]);
  });

  it('returns every player of a tie exactly at the cutoff', async () => {
    const { service } = await makeService([
      { playerId: 1, teamEraId: 10, eventCount: 5 },
      { playerId: 2, teamEraId: 20, eventCount: 5 },
      { playerId: 3, teamEraId: 30, eventCount: 1 },
    ]);

    const winners = await service.compute({
      competitionId: 3,
      role: 'acting',
      types: TOUCHDOWNS,
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
      { playerId: 1, teamEraId: 10, eventCount: 5 },
      { playerId: 2, teamEraId: 20, eventCount: 5 },
      { playerId: 3, teamEraId: 30, eventCount: 5 },
    ]);

    const winners = await service.compute({
      competitionId: 3,
      role: 'acting',
      types: TOUCHDOWNS,
      eligiblePositionIds: undefined,
      tieCutoff: 2,
    });

    expect(winners).toEqual([]);
  });

  it('awards nobody when no player has a single matching event', async () => {
    const { service } = await makeService([]);

    const winners = await service.compute({
      competitionId: 3,
      role: 'acting',
      types: TOUCHDOWNS,
      eligiblePositionIds: undefined,
      tieCutoff: 4,
    });

    expect(winners).toEqual([]);
  });

  it('awards nobody when the top count is zero', async () => {
    const { service } = await makeService([
      { playerId: 1, teamEraId: 10, eventCount: 0 },
    ]);

    const winners = await service.compute({
      competitionId: 3,
      role: 'acting',
      types: TOUCHDOWNS,
      eligiblePositionIds: undefined,
      tieCutoff: 4,
    });

    expect(winners).toEqual([]);
  });

  it('filters on both curated sides of a compound rule, scoped to the competition', async () => {
    const { service, db } = await makeService([]);

    await service.compute({
      competitionId: 42,
      role: 'acting',
      types: {
        actionTypes: ['foul'],
        consequenceTypes: ['casualty', 'death'],
      },
      eligiblePositionIds: undefined,
      tieCutoff: 4,
    });

    const values = extractAllFilterValues(firstCallArg(db.chains[0].where));
    expect(values).toContain('foul');
    expect(values).toContain('casualty');
    expect(values).toContain('death');
    expect(values).toContain(42);
    // Star players are excluded from every computed rule.
    expect(values).toContain(false);
  });

  it('fetches one row past the cutoff so an over-cutoff tie is detectable', async () => {
    const { service, db } = await makeService([]);

    await service.compute({
      competitionId: 3,
      role: 'acting',
      types: TOUCHDOWNS,
      eligiblePositionIds: undefined,
      tieCutoff: 4,
    });

    expect(db.chains[0].limit).toHaveBeenCalledWith(5);
  });

  it('narrows the candidate pool to a rule’s eligible positions', async () => {
    const { service, db, positionFilter } = await makeService(
      [],
      inArray(positions.id, [21, 22]),
    );

    await service.compute({
      competitionId: 3,
      role: 'acting',
      types: TOUCHDOWNS,
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

  it('awards nobody when a restriction resolved to no position at all', async () => {
    const { service, db, positionFilter } = await makeService([], sql`false`);

    await service.compute({
      competitionId: 3,
      role: 'acting',
      types: TOUCHDOWNS,
      eligiblePositionIds: [],
      tieCutoff: 4,
    });

    expect(positionFilter.build).toHaveBeenCalledWith([]);
    expect(sqlText(firstCallArg(db.chains[0].where))).toContain('false');
  });
});
