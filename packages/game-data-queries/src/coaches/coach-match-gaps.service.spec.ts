import type { Db } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import type { QueryChain } from '@blood-bowl-tracker/db/test-helpers';
import {
  extractAllFilterValues,
  extractFilterValues,
  extractJoinColumns,
  firstCallArg,
  mockDb,
  sqlText,
} from '@blood-bowl-tracker/db/test-helpers';
import { FACT_SCOPE_ALL_TIME } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { CoachMatchGapsService } from './coach-match-gaps.service';

describe('CoachMatchGapsService', () => {
  let service: CoachMatchGapsService;

  async function build(...rowsPerQuery: unknown[][]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [CoachMatchGapsService, { provide: DB, useValue: db }],
    }).compile();
    service = moduleRef.get(CoachMatchGapsService);
    return { db, chains };
  }

  const gapRows = [
    { coachId: 1, name: 'Roze Madder', count: 91 },
    { coachId: 2, name: 'Grashnak', count: 34 },
  ];

  // Three builders are issued per call: the distinct match list, the
  // LAG() gap subquery, and the outer aggregate that is awaited.
  it('getGapBetweenMatchesByCoachDescending returns the rows the outer query resolves to', async () => {
    const { db, chains } = await build([], [], gapRows);
    await expect(
      service.getGapBetweenMatchesByCoachDescending(FACT_SCOPE_ALL_TIME, 21),
    ).resolves.toEqual(gapRows);
    expect(db.selectDistinct).toHaveBeenCalledTimes(1);
    expect(db.select).toHaveBeenCalledTimes(2);
    expect(chains[2].limit).toHaveBeenCalledWith(21);
  });

  it('computes each gap with a LAG window function partitioned by coach and ordered by match date', async () => {
    const { db } = await build([], [], gapRows);
    await service.getGapBetweenMatchesByCoachDescending(
      FACT_SCOPE_ALL_TIME,
      21,
    );
    const gapFields = firstCallArg(db.select, 0, 0) as { gapDays: unknown };
    const text = sqlText(gapFields.gapDays);
    expect(text).toContain('lag(');
    expect(text).toContain('over (partition by');
    expect(text).toContain('order by');
  });

  it('deduplicates a coach match list so a coach with two teams in one match is not double-counted', async () => {
    const { db } = await build([], [], gapRows);
    await service.getGapBetweenMatchesByCoachDescending(
      FACT_SCOPE_ALL_TIME,
      21,
    );
    const matchFields = firstCallArg(db.selectDistinct, 0, 0) as {
      coachId: unknown;
      name: unknown;
      playedAt: unknown;
    };
    expect(matchFields.playedAt).toBeDefined();
  });

  it('excludes a coach first match, so coaches with fewer than two matches in scope drop out', async () => {
    const { chains } = await build([], [], gapRows);
    await service.getGapBetweenMatchesByCoachDescending(
      FACT_SCOPE_ALL_TIME,
      21,
    );
    expect(sqlText(firstCallArg(chains[2].where))).toContain('is not null');
  });

  it('ranks the largest gap first, rounded to whole days', async () => {
    const { chains } = await build([], [], gapRows);
    await service.getGapBetweenMatchesByCoachDescending(
      FACT_SCOPE_ALL_TIME,
      21,
    );
    const orderBy = sqlText(firstCallArg(chains[2].orderBy));
    expect(orderBy).toContain('max(');
    expect(orderBy).toContain('round(');
    expect(orderBy).toContain(' desc');
  });

  it('getGapBetweenMatchesByCoachAscending ranks the same longest-gap metric ascending', async () => {
    const { chains } = await build([], [], gapRows);
    await expect(
      service.getGapBetweenMatchesByCoachAscending(FACT_SCOPE_ALL_TIME, 21),
    ).resolves.toEqual(gapRows);
    const orderBy = sqlText(firstCallArg(chains[2].orderBy));
    expect(orderBy).toContain('max(');
    expect(orderBy).toContain(' asc');
    expect(orderBy).not.toContain(' desc');
  });

  it('getGapBetweenMatchesByCoachAscending requires at least 4 gaps (5 matches)', async () => {
    const { chains } = await build([], [], gapRows);
    await service.getGapBetweenMatchesByCoachAscending(FACT_SCOPE_ALL_TIME, 21);
    const having = sqlText(firstCallArg(chains[2].having));
    expect(having).toContain('count(');
    expect(having).toContain('>= 4');
  });

  it('getGapBetweenMatchesByCoachDescending does not apply a minimum-matches floor', async () => {
    const { chains } = await build([], [], gapRows);
    await service.getGapBetweenMatchesByCoachDescending(
      FACT_SCOPE_ALL_TIME,
      21,
    );
    expect(chains[2].having).not.toHaveBeenCalled();
  });

  it('applies no filter when the scope is all-time', async () => {
    const { chains } = await build([], [], gapRows);
    await service.getGapBetweenMatchesByCoachDescending(
      FACT_SCOPE_ALL_TIME,
      21,
    );
    expect(firstCallArg(chains[0].where)).toBeUndefined();
  });

  it('filters the match list by era when an eraId is given', async () => {
    const { chains } = await build([], [], gapRows);
    await service.getGapBetweenMatchesByCoachDescending({ eraId: 20 }, 21);
    expect(extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1))).toEqual(
      ['match_teams.match_id', 'matches.id'],
    );
    expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(20);
  });

  it('filters the match list by league via the eras join', async () => {
    const { chains } = await build([], [], gapRows);
    await service.getGapBetweenMatchesByCoachAscending({ leagueId: 9 }, 21);
    expect(extractJoinColumns(firstCallArg(chains[0].innerJoin, 2, 1))).toEqual(
      ['eras.id', 'team_eras.era_id'],
    );
    expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(9);
  });

  it('getAverageGapBetweenMatchesByCoach returns the rows the outer query resolves to', async () => {
    const averageRows = [
      { coachId: 2, name: 'Grashnak', count: 7 },
      { coachId: 1, name: 'Roze Madder', count: 30 },
    ];
    const { db, chains } = await build([], [], averageRows);
    await expect(
      service.getAverageGapBetweenMatchesByCoach(FACT_SCOPE_ALL_TIME, 21),
    ).resolves.toEqual(averageRows);
    expect(db.selectDistinct).toHaveBeenCalledTimes(1);
    expect(db.select).toHaveBeenCalledTimes(2);
    expect(chains[2].limit).toHaveBeenCalledWith(21);
  });

  it('ranks the smallest average gap first, rounded to whole days', async () => {
    const { chains } = await build([], [], gapRows);
    await service.getAverageGapBetweenMatchesByCoach(FACT_SCOPE_ALL_TIME, 21);
    const orderBy = sqlText(firstCallArg(chains[2].orderBy));
    expect(orderBy).toContain('avg(');
    expect(orderBy).toContain('round(');
    expect(orderBy).toContain(' asc');
    expect(orderBy).not.toContain(' desc');
  });

  it('averages only real gaps, excluding each coach first match', async () => {
    const { chains } = await build([], [], gapRows);
    await service.getAverageGapBetweenMatchesByCoach(FACT_SCOPE_ALL_TIME, 21);
    expect(sqlText(firstCallArg(chains[2].where))).toContain('is not null');
  });

  it('filters the average by era when an eraId is given', async () => {
    const { chains } = await build([], [], gapRows);
    await service.getAverageGapBetweenMatchesByCoach({ eraId: 20 }, 21);
    expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(20);
  });

  it('filters the average by league when a leagueId is given', async () => {
    const { chains } = await build([], [], gapRows);
    await service.getAverageGapBetweenMatchesByCoach({ leagueId: 9 }, 21);
    expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(9);
  });

  it('getAverageGapBetweenMatchesByCoach requires at least 4 gaps (5 matches)', async () => {
    const { chains } = await build([], [], gapRows);
    await service.getAverageGapBetweenMatchesByCoach(FACT_SCOPE_ALL_TIME, 21);
    const having = sqlText(firstCallArg(chains[2].having));
    expect(having).toContain('count(');
    expect(having).toContain('>= 4');
  });

  it('the time-between-matches subquery only sees matches of the given category', async () => {
    const { chains } = await build([], [], []);
    await service.getAverageGapBetweenMatchesByCoach(
      { category: 'season_final' },
      21,
    );
    // chains[0] is the inner selectDistinct that feeds the window function.
    expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
      'season_final',
    ]);
  });
});
