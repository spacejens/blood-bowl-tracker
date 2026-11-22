import type { Db } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import type { QueryChain } from '@blood-bowl-tracker/db/test-helpers';
import {
  extractAllFilterValues,
  extractJoinColumns,
  firstCallArg,
  mockDb,
  sqlText,
} from '@blood-bowl-tracker/db/test-helpers';
import {
  CASUALTY_CAUSED_TYPES,
  CASUALTY_SUFFERED_TYPES,
  DEATH_CAUSED_TYPES,
  DEATH_SUFFERED_TYPES,
  FACT_SCOPE_ALL_TIME,
  LASTING_INJURY_SUFFERED_TYPES,
  SERIOUS_INJURY_CAUSED_TYPES,
  SERIOUS_INJURY_SUFFERED_TYPES,
} from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import {
  MIN_MATCHES_FOR_PER_MATCH_AVERAGE,
  PerMatchAverageSqlService,
} from '../shared/per-match-average-sql.service';
import { CoachAverageStatisticsService } from './coach-average-statistics.service';

const ACTING_SIDE = 'match_events.acting_match_team_id';
const VICTIM_SIDE = 'match_events.consequence_match_team_id';
const ACTION_TYPE = 'match_events.action_type';
const CONSEQUENCE_TYPE = 'match_events.consequence_type';

describe('CoachAverageStatisticsService', () => {
  let service: CoachAverageStatisticsService;

  async function build(...rowsPerQuery: unknown[][]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [
        CoachAverageStatisticsService,
        // Pure, dependency-free SQL-fragment builder: passed real so the
        // assertions below cover the SQL it contributes (see CLAUDE.md).
        PerMatchAverageSqlService,
        { provide: DB, useValue: db },
      ],
    }).compile();
    service = moduleRef.get(CoachAverageStatisticsService);
    return { db, chains };
  }

  /** The `average` expression handed to `db.select({ ... })`. */
  function selectedAverage(db: Db): unknown {
    return (firstCallArg(db.select) as { average: unknown }).average;
  }

  describe.each([
    'averageTouchdownsScoredByCoach',
    'averageTouchdownsConcededByCoach',
    'averageCasualtiesCausedByCoach',
    'averageCasualtiesSufferedByCoach',
    'averageSeriousInjuriesCausedByCoach',
    'averageSeriousInjuriesSufferedByCoach',
    'averageLastingInjuriesCausedByCoach',
    'averageLastingInjuriesSufferedByCoach',
    'averageDeathsCausedByCoach',
    'averageDeathsSufferedByCoach',
  ] as const)('%s', (method) => {
    it('returns the rows the query resolves to', async () => {
      const rows = [
        { coachId: 1, name: 'Roze Madder', average: 3.42 },
        { coachId: 2, name: 'Skarsnik', average: 1.5 },
      ];
      await build(rows);
      await expect(
        service[method](FACT_SCOPE_ALL_TIME, 'desc', 21),
      ).resolves.toEqual(rows);
    });

    it('joins coaches to matches through match_teams, team_eras, eras and teams', async () => {
      const { db, chains } = await build([]);
      await service[method](FACT_SCOPE_ALL_TIME, 'desc', 21);
      expect(db.select).toHaveBeenCalledTimes(1);
      expect(chains[0].innerJoin).toHaveBeenCalledTimes(5);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['match_teams.match_id', 'matches.id']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 1, 1)),
      ).toEqual(['team_eras.id', 'match_teams.team_era_id']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 2, 1)),
      ).toEqual(['eras.id', 'team_eras.era_id']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 3, 1)),
      ).toEqual(['teams.id', 'team_eras.team_id']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 4, 1)),
      ).toEqual(['coaches.id', 'teams.coach_id']);
      expect(chains[0].limit).toHaveBeenCalledWith(21);
    });

    it('averages over distinct matches, rounded to two decimals as a double', async () => {
      const { db } = await build([]);
      await service[method](FACT_SCOPE_ALL_TIME, 'desc', 21);
      const text = sqlText(selectedAverage(db));
      expect(text).toContain('round(sum(');
      expect(text).toContain('::numeric / count(distinct ');
      expect(text).toContain(', 2)::double precision');
    });

    it('only ranks coaches with at least the minimum number of matches', async () => {
      const { chains } = await build([]);
      await service[method](FACT_SCOPE_ALL_TIME, 'desc', 21);
      const having = firstCallArg(chains[0].having);
      expect(sqlText(having)).toContain('count(distinct ');
      expect(sqlText(having)).toContain(' >= ');
      expect(extractJoinColumns(having)).toEqual(['matches.id']);
      expect(extractAllFilterValues(having)).toEqual([
        MIN_MATCHES_FOR_PER_MATCH_AVERAGE,
      ]);
    });

    it('orders highest first for desc, breaking ties by coach name', async () => {
      const { chains } = await build([]);
      await service[method](FACT_SCOPE_ALL_TIME, 'desc', 21);
      const primary = firstCallArg(chains[0].orderBy, 0, 0);
      const tieBreak = firstCallArg(chains[0].orderBy, 0, 1);
      expect(sqlText(primary)).toMatch(/ desc$/);
      expect(sqlText(primary)).toContain('round(sum(');
      expect(sqlText(tieBreak)).toMatch(/ asc$/);
      expect(extractJoinColumns(tieBreak)).toEqual(['coaches.name']);
    });

    it('orders lowest first for asc, breaking ties by coach name', async () => {
      const { chains } = await build([]);
      await service[method](FACT_SCOPE_ALL_TIME, 'asc', 21);
      const primary = firstCallArg(chains[0].orderBy, 0, 0);
      const tieBreak = firstCallArg(chains[0].orderBy, 0, 1);
      expect(sqlText(primary)).toMatch(/ asc$/);
      expect(sqlText(primary)).toContain('round(sum(');
      expect(extractJoinColumns(tieBreak)).toEqual(['coaches.name']);
    });

    it('groups by coach', async () => {
      const { chains } = await build([]);
      await service[method](FACT_SCOPE_ALL_TIME, 'desc', 21);
      expect(extractJoinColumns(chains[0].groupBy.mock.calls[0])).toEqual([
        'coaches.id',
        'coaches.name',
      ]);
    });

    it('applies the league, era and match-category scope filters', async () => {
      const { chains } = await build([], [], []);
      await service[method]({ leagueId: 9 }, 'desc', 21);
      await service[method]({ eraId: 20 }, 'desc', 21);
      await service[method]({ category: 'season_final' }, 'desc', 21);
      expect(extractJoinColumns(firstCallArg(chains[0].where))).toEqual([
        'eras.league_id',
      ]);
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        9,
      ]);
      expect(extractJoinColumns(firstCallArg(chains[1].where))).toEqual([
        'team_eras.era_id',
      ]);
      expect(extractAllFilterValues(firstCallArg(chains[1].where))).toEqual([
        20,
      ]);
      expect(extractJoinColumns(firstCallArg(chains[2].where))).toEqual([
        'matches.category',
      ]);
      expect(extractAllFilterValues(firstCallArg(chains[2].where))).toEqual([
        'season_final',
      ]);
    });

    it('ignores the competition scope', async () => {
      const { chains } = await build([]);
      await service[method]({ competitionId: 30 }, 'desc', 21);
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([]);
    });
  });

  it.each([
    'averageCasualtiesCausedByCoach',
    'averageCasualtiesSufferedByCoach',
    'averageSeriousInjuriesCausedByCoach',
    'averageSeriousInjuriesSufferedByCoach',
    'averageLastingInjuriesCausedByCoach',
    'averageLastingInjuriesSufferedByCoach',
    'averageDeathsCausedByCoach',
    'averageDeathsSufferedByCoach',
  ] as const)('%s averages this side’s event count', async (method) => {
    const { db } = await build([]);
    await service[method](FACT_SCOPE_ALL_TIME, 'desc', 21);
    const average = selectedAverage(db);
    expect(sqlText(average)).toContain(
      'round(sum(coalesce(side_event_counts.event_count, 0))::numeric / count(distinct ',
    );
    expect(extractJoinColumns(average)).toEqual(['matches.id']);
  });

  it.each([
    'averageTouchdownsScoredByCoach',
    'averageTouchdownsConcededByCoach',
  ] as const)('%s joins no per-side event counts', async (method) => {
    const { chains } = await build([]);
    await service[method](FACT_SCOPE_ALL_TIME, 'desc', 21);
    expect(chains[0].leftJoin).not.toHaveBeenCalled();
  });

  it('sums each side’s own score for touchdowns scored', async () => {
    const { db } = await build([]);
    await service.averageTouchdownsScoredByCoach(
      FACT_SCOPE_ALL_TIME,
      'desc',
      21,
    );
    expect(extractJoinColumns(selectedAverage(db))).toEqual([
      'match_teams.score',
      'matches.id',
    ]);
  });

  it('sums every other side of the same match for touchdowns conceded', async () => {
    const { db } = await build([]);
    await service.averageTouchdownsConcededByCoach(
      FACT_SCOPE_ALL_TIME,
      'desc',
      21,
    );
    const average = selectedAverage(db);
    const text = sqlText(average);
    expect(text).toContain('select coalesce(sum(opponent_sides.score), 0)');
    expect(text).toContain(
      ' as opponent_sides where opponent_sides.match_id = ',
    );
    expect(text).toContain(' and opponent_sides.id <> ');
    expect(extractJoinColumns(average)).toEqual([
      'match_teams.match_id',
      'match_teams.id',
      'matches.id',
    ]);
  });

  it.each([
    {
      method: 'averageCasualtiesCausedByCoach',
      sideColumn: ACTING_SIDE,
      typeColumn: ACTION_TYPE,
      types: CASUALTY_CAUSED_TYPES,
    },
    {
      method: 'averageCasualtiesSufferedByCoach',
      sideColumn: VICTIM_SIDE,
      typeColumn: CONSEQUENCE_TYPE,
      types: CASUALTY_SUFFERED_TYPES,
    },
    {
      method: 'averageSeriousInjuriesCausedByCoach',
      sideColumn: ACTING_SIDE,
      typeColumn: ACTION_TYPE,
      types: SERIOUS_INJURY_CAUSED_TYPES,
    },
    {
      method: 'averageSeriousInjuriesSufferedByCoach',
      sideColumn: VICTIM_SIDE,
      typeColumn: CONSEQUENCE_TYPE,
      types: SERIOUS_INJURY_SUFFERED_TYPES,
    },
    {
      method: 'averageLastingInjuriesSufferedByCoach',
      sideColumn: VICTIM_SIDE,
      typeColumn: CONSEQUENCE_TYPE,
      types: LASTING_INJURY_SUFFERED_TYPES,
    },
    {
      method: 'averageDeathsCausedByCoach',
      sideColumn: ACTING_SIDE,
      typeColumn: ACTION_TYPE,
      types: DEATH_CAUSED_TYPES,
    },
    {
      method: 'averageDeathsSufferedByCoach',
      sideColumn: VICTIM_SIDE,
      typeColumn: CONSEQUENCE_TYPE,
      types: DEATH_SUFFERED_TYPES,
    },
  ] as const)(
    '$method left-joins this side’s events of the matching types',
    async ({ method, sideColumn, typeColumn, types }) => {
      const { chains } = await build([]);
      await service[method](FACT_SCOPE_ALL_TIME, 'desc', 21);
      expect(chains[0].leftJoin).toHaveBeenCalledTimes(1);
      const derivedTable = firstCallArg(chains[0].leftJoin, 0, 0);
      expect(sqlText(derivedTable)).toMatch(/\) as side_event_counts$/);
      expect(extractJoinColumns(derivedTable)).toEqual([
        sideColumn,
        typeColumn,
        sideColumn,
      ]);
      expect(extractAllFilterValues(derivedTable)).toEqual([...types]);
      const on = firstCallArg(chains[0].leftJoin, 0, 1);
      expect(sqlText(on)).toMatch(/^side_event_counts\.match_team_id = /);
      expect(extractJoinColumns(on)).toEqual(['match_teams.id']);
    },
  );

  it('averageLastingInjuriesCausedByCoach counts casualty actions whose own row carries a lasting consequence', async () => {
    const { chains } = await build([]);
    await service.averageLastingInjuriesCausedByCoach(
      FACT_SCOPE_ALL_TIME,
      'desc',
      21,
    );
    const derivedTable = firstCallArg(chains[0].leftJoin, 0, 0);
    expect(extractJoinColumns(derivedTable)).toEqual([
      ACTING_SIDE,
      ACTION_TYPE,
      CONSEQUENCE_TYPE,
      ACTING_SIDE,
    ]);
    expect(extractAllFilterValues(derivedTable)).toEqual([
      ...CASUALTY_CAUSED_TYPES,
      ...LASTING_INJURY_SUFFERED_TYPES,
    ]);
  });
});
