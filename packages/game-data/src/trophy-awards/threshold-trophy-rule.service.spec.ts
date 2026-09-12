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
import { CareerThresholdTrophyRuleService } from './threshold-trophy-rule.service';
import { TrophyRuleEventTypeFilterService } from './trophy-rule-event-type-filter.service';
import { TrophyRulePositionFilterService } from './trophy-rule-position-filter.service';

/**
 * Three builders are issued per call, in this order: the running-total
 * subquery, the correlated already-awarded `NOT EXISTS` inside its `WHERE`,
 * and the outer `DISTINCT ON` that is actually awaited. Only the third
 * resolves to rows, so the crossing rows are seeded third.
 *
 * These tests assert the query's *shape* — scope, window function, ordering —
 * plus what the service does with the rows it gets back. Whether the window
 * function picks the right crossing match is a question only real Postgres can
 * answer, and lives in `test/career-threshold-trophy-rule.e2e-spec.ts`.
 *
 * `positionCondition` is what the mocked position filter answers with for
 * this test: the filter builds part of a live SQL query, so it is stubbed
 * rather than provided for real, and its own behaviour — which curated list
 * maps to which condition — is asserted in its own spec.
 */
async function makeService(
  crossings: unknown[] = [],
  positionCondition: SQL | undefined = undefined,
): Promise<{
  service: CareerThresholdTrophyRuleService;
  db: MockDbResult;
  positionFilter: MockProxy<TrophyRulePositionFilterService>;
}> {
  const db = mockDb([], [], crossings);
  const positionFilter = mock<TrophyRulePositionFilterService>();
  positionFilter.build.mockReturnValue(positionCondition);
  const moduleRef = await Test.createTestingModule({
    providers: [
      CareerThresholdTrophyRuleService,
      // The event-type filter is pure and dependency-free, so it is real (see
      // CLAUDE.md's carve-out). The position filter builds part of a live SQL
      // query, so it is mocked and asserted in its own spec instead.
      TrophyRuleEventTypeFilterService,
      { provide: TrophyRulePositionFilterService, useValue: positionFilter },
      MatchScopeFilterService,
      { provide: DB, useValue: db.db },
    ],
  }).compile();
  return {
    service: moduleRef.get(CareerThresholdTrophyRuleService),
    db,
    positionFilter,
  };
}

const SPP_OPTIONS = {
  trophyId: 40,
  competitionId: 7,
  leagueId: 1,
  role: 'acting',
  types: { actionTypes: [], consequenceTypes: [] },
  eligiblePositionIds: undefined,
  threshold: 176,
  measure: 'spp_sum',
} as const;

const COUNT_OPTIONS = {
  trophyId: 41,
  competitionId: 7,
  leagueId: 1,
  role: 'consequence',
  types: { actionTypes: [], consequenceTypes: ['casualty', 'death'] },
  eligiblePositionIds: undefined,
  threshold: 3,
  measure: 'event_count',
} as const;

/** The running-total expression the subquery selects. */
function runningTotalText(db: MockDbResult): string {
  const fields = firstCallArg(db.db.select, 0, 0) as {
    runningTotal: unknown;
  };
  return sqlText(fields.runningTotal);
}

describe('CareerThresholdTrophyRuleService', () => {
  it('returns every player who crossed in this competition, not just the top one', async () => {
    const { service } = await makeService([
      { playerId: 1, teamEraId: 10, competitionId: 7 },
      { playerId: 2, teamEraId: 20, competitionId: 7 },
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

  it('drops a player whose crossing match belongs to another competition', async () => {
    // The whole point of the league-wide scan: it returns every player who has
    // ever crossed, and only the one who crossed *here* is awarded here. The
    // other player's own competition awards them on its own call.
    const { service } = await makeService([
      { playerId: 1, teamEraId: 10, competitionId: 7 },
      { playerId: 2, teamEraId: 20, competitionId: 9 },
    ]);

    expect(await service.compute(SPP_OPTIONS)).toEqual([
      { playerId: 1, teamEraId: 10 },
    ]);
  });

  it('does not narrow the query itself to the competition, which would pick the wrong crossing', async () => {
    // A competition predicate in the outer WHERE would be applied before
    // DISTINCT ON chooses a row, yielding the earliest crossing *within* that
    // competition rather than the player's real one.
    const { service, db } = await makeService();

    await service.compute(SPP_OPTIONS);

    expect(
      extractAllFilterValues(firstCallArg(db.chains[2].where)),
    ).not.toContain(7);
  });

  it('scopes the candidate query to the league, not to one competition', async () => {
    const { service, db } = await makeService();

    await service.compute(SPP_OPTIONS);

    const whereValues = extractAllFilterValues(
      firstCallArg(db.chains[0].where),
    );
    expect(whereValues).toContain(1);
    expect(whereValues).not.toContain(7);
  });

  it('compares the running total against the threshold in the outer query', async () => {
    const { service, db } = await makeService();

    await service.compute(SPP_OPTIONS);

    expect(extractAllFilterValues(firstCallArg(db.chains[2].where))).toContain(
      176,
    );
  });

  it('accumulates with a window function ordered by match date, then event id', async () => {
    const { service, db } = await makeService();

    await service.compute(SPP_OPTIONS);

    const text = runningTotalText(db);
    expect(text).toContain('sum(');
    expect(text).toContain('over (partition by');
    expect(text).toContain('order by');
    expect(text).toContain('rows between unbounded preceding and current row');
  });

  it('picks each player earliest crossing event via distinct on, ordered chronologically', async () => {
    const { service, db } = await makeService();

    await service.compute(SPP_OPTIONS);

    expect(db.db.selectDistinctOn).toHaveBeenCalledTimes(1);
    const orderBy = db.chains[2].orderBy;
    expect(orderBy).toHaveBeenCalledTimes(1);
    expect(orderBy.mock.calls[0]).toHaveLength(3);
  });

  it('banks spp_adjustment before the first event for an spp_sum measure', async () => {
    const { service, db } = await makeService();

    await service.compute(SPP_OPTIONS);

    // `coalesce(players.spp_adjustment, 0) + sum(coalesce(spp_value, 0)) over ...`
    expect(runningTotalText(db)).toContain('coalesce(');
    expect(runningTotalText(db)).not.toContain('0 + sum(1)');
  });

  it('counts events from zero, ignoring spp_adjustment, for an event_count measure', async () => {
    const { service, db } = await makeService();

    await service.compute(COUNT_OPTIONS);

    expect(runningTotalText(db)).toContain('0 + sum(1)');
    expect(runningTotalText(db)).not.toContain('coalesce(');

    const whereValues = extractAllFilterValues(
      firstCallArg(db.chains[0].where),
    );
    expect(whereValues).toContain('casualty');
    expect(whereValues).toContain('death');
  });

  it('excludes a player who already holds this trophy inside the candidate query', async () => {
    // Not a second query and a JS filter: an already-decided player must never
    // enter the window computation at all.
    const { service, db } = await makeService();

    await service.compute(SPP_OPTIONS);

    expect(sqlText(firstCallArg(db.chains[0].where))).toContain('not ');
    expect(sqlText(firstCallArg(db.chains[0].where))).toContain('exists ');
    expect(extractAllFilterValues(firstCallArg(db.chains[1].where))).toContain(
      40,
    );
  });

  it('narrows the candidate pool to a rule’s eligible positions', async () => {
    const { service, db, positionFilter } = await makeService(
      [],
      inArray(positions.id, [21, 22]),
    );

    await service.compute({ ...SPP_OPTIONS, eligiblePositionIds: [21, 22] });

    expect(positionFilter.build).toHaveBeenCalledWith([21, 22]);
    const where = firstCallArg(db.chains[0].where);
    expect(extractAllFilterValues(where)).toEqual(
      expect.arrayContaining([21, 22]),
    );
    expect(extractJoinColumns(where)).toContain('positions.id');
  });

  it('awards nobody when a restriction resolved to no position at all', async () => {
    const { service, db, positionFilter } = await makeService([], sql`false`);

    await service.compute({ ...SPP_OPTIONS, eligiblePositionIds: [] });

    expect(positionFilter.build).toHaveBeenCalledWith([]);
    expect(sqlText(firstCallArg(db.chains[0].where))).toContain('false');
  });
});
