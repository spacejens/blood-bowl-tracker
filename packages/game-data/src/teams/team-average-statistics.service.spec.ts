import type { Db } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import type { QueryChain } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { FACT_SCOPE_ALL_TIME } from '../shared/fact-scope';
import {
  CASUALTY_CAUSED_TYPES,
  CASUALTY_SUFFERED_TYPES,
  DEATH_CAUSED_TYPES,
  DEATH_SUFFERED_TYPES,
  LASTING_INJURY_SUFFERED_TYPES,
  SERIOUS_INJURY_CAUSED_TYPES,
  SERIOUS_INJURY_SUFFERED_TYPES,
} from '../shared/match-event-types';
import {
  extractAllFilterValues,
  extractJoinColumns,
  firstCallArg,
  sqlText,
} from '../shared/query-assertions.test-helpers';
import {
  MIN_MATCHES_FOR_TEAM_AVERAGE,
  TeamAverageStatisticsService,
} from './team-average-statistics.service';

describe('TeamAverageStatisticsService', () => {
  let service: TeamAverageStatisticsService;

  async function build(...rowsPerQuery: unknown[][]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [TeamAverageStatisticsService, { provide: DB, useValue: db }],
    }).compile();
    service = moduleRef.get(TeamAverageStatisticsService);
    return { db, chains };
  }

  /** The `average` expression handed to `db.select({ ... })`. */
  function selectedAverage(db: Db): unknown {
    return (firstCallArg(db.select) as { average: unknown }).average;
  }

  it('floors the average at five matches', () => {
    expect(MIN_MATCHES_FOR_TEAM_AVERAGE).toBe(5);
  });

  describe.each([
    'averageTouchdownsScoredByTeam',
    'averageTouchdownsConcededByTeam',
    'averageCasualtiesCausedByTeam',
    'averageCasualtiesSufferedByTeam',
    'averageSeriousInjuriesCausedByTeam',
    'averageSeriousInjuriesSufferedByTeam',
    'averageLastingInjuriesCausedByTeam',
    'averageLastingInjuriesSufferedByTeam',
    'averageDeathsCausedByTeam',
    'averageDeathsSufferedByTeam',
  ] as const)('%s', (method) => {
    it('returns the rows the query resolves to', async () => {
      const rows = [
        { teamId: 1, name: '40 grinders', average: 3.42 },
        { teamId: 2, name: 'Gouged Eye', average: 1.5 },
      ];
      await build(rows);
      await expect(
        service[method](FACT_SCOPE_ALL_TIME, 'desc', 21),
      ).resolves.toEqual(rows);
    });

    it('joins teams to matches through match_teams, team_eras and eras', async () => {
      const { db, chains } = await build([]);
      await service[method](FACT_SCOPE_ALL_TIME, 'desc', 21);
      expect(db.select).toHaveBeenCalledTimes(1);
      expect(chains[0].innerJoin).toHaveBeenCalledTimes(4);
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

    it('only ranks teams with at least the minimum number of matches', async () => {
      const { chains } = await build([]);
      await service[method](FACT_SCOPE_ALL_TIME, 'desc', 21);
      const having = firstCallArg(chains[0].having);
      expect(sqlText(having)).toContain('count(distinct ');
      expect(sqlText(having)).toContain(' >= ');
      expect(extractJoinColumns(having)).toEqual(['matches.id']);
      expect(extractAllFilterValues(having)).toEqual([
        MIN_MATCHES_FOR_TEAM_AVERAGE,
      ]);
    });

    it('orders highest first for desc, breaking ties by team name', async () => {
      const { chains } = await build([]);
      await service[method](FACT_SCOPE_ALL_TIME, 'desc', 21);
      const primary = firstCallArg(chains[0].orderBy, 0, 0);
      const tieBreak = firstCallArg(chains[0].orderBy, 0, 1);
      expect(sqlText(primary)).toMatch(/ desc$/);
      expect(sqlText(primary)).toContain('round(sum(');
      expect(sqlText(tieBreak)).toMatch(/ asc$/);
      expect(extractJoinColumns(tieBreak)).toEqual(['teams.name']);
    });

    it('orders lowest first for asc, breaking ties by team name', async () => {
      const { chains } = await build([]);
      await service[method](FACT_SCOPE_ALL_TIME, 'asc', 21);
      const primary = firstCallArg(chains[0].orderBy, 0, 0);
      const tieBreak = firstCallArg(chains[0].orderBy, 0, 1);
      expect(sqlText(primary)).toMatch(/ asc$/);
      expect(sqlText(primary)).toContain('round(sum(');
      expect(extractJoinColumns(tieBreak)).toEqual(['teams.name']);
    });

    it('groups by team', async () => {
      const { chains } = await build([]);
      await service[method](FACT_SCOPE_ALL_TIME, 'desc', 21);
      expect(extractJoinColumns(chains[0].groupBy.mock.calls[0])).toEqual([
        'teams.id',
        'teams.name',
      ]);
    });

    it('applies the league, era and match-category scope filters', async () => {
      const { chains } = await build([], [], []);
      await service[method]({ leagueId: 9 }, 'desc', 21);
      await service[method]({ eraId: 20 }, 'desc', 21);
      await service[method]({ category: 'season_final' }, 'desc', 21);
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        9,
      ]);
      expect(extractJoinColumns(firstCallArg(chains[0].where))).toEqual([
        'eras.league_id',
      ]);
      expect(extractAllFilterValues(firstCallArg(chains[1].where))).toEqual([
        20,
      ]);
      expect(extractJoinColumns(firstCallArg(chains[1].where))).toEqual([
        'team_eras.era_id',
      ]);
      expect(extractAllFilterValues(firstCallArg(chains[2].where))).toEqual([
        'season_final',
      ]);
      expect(extractJoinColumns(firstCallArg(chains[2].where))).toEqual([
        'matches.category',
      ]);
    });

    it('ignores the competition scope', async () => {
      const { chains } = await build([]);
      await service[method]({ competitionId: 30 }, 'desc', 21);
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([]);
    });
  });

  it.each([
    'averageTouchdownsScoredByTeam',
    'averageTouchdownsConcededByTeam',
  ] as const)('%s joins no per-side event counts', async (method) => {
    const { chains } = await build([]);
    await service[method](FACT_SCOPE_ALL_TIME, 'desc', 21);
    expect(chains[0].leftJoin).not.toHaveBeenCalled();
  });

  it('sums each side’s own score for touchdowns scored', async () => {
    const { db } = await build([]);
    await service.averageTouchdownsScoredByTeam(
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
    await service.averageTouchdownsConcededByTeam(
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
      method: 'averageCasualtiesCausedByTeam',
      sideColumn: 'match_events.acting_match_team_id',
      typeColumn: 'match_events.action_type',
      types: CASUALTY_CAUSED_TYPES,
    },
    {
      method: 'averageSeriousInjuriesCausedByTeam',
      sideColumn: 'match_events.acting_match_team_id',
      typeColumn: 'match_events.action_type',
      types: SERIOUS_INJURY_CAUSED_TYPES,
    },
    {
      method: 'averageCasualtiesSufferedByTeam',
      sideColumn: 'match_events.consequence_match_team_id',
      typeColumn: 'match_events.consequence_type',
      types: CASUALTY_SUFFERED_TYPES,
    },
    {
      method: 'averageSeriousInjuriesSufferedByTeam',
      sideColumn: 'match_events.consequence_match_team_id',
      typeColumn: 'match_events.consequence_type',
      types: SERIOUS_INJURY_SUFFERED_TYPES,
    },
    {
      method: 'averageLastingInjuriesSufferedByTeam',
      sideColumn: 'match_events.consequence_match_team_id',
      typeColumn: 'match_events.consequence_type',
      types: LASTING_INJURY_SUFFERED_TYPES,
    },
    {
      method: 'averageDeathsCausedByTeam',
      sideColumn: 'match_events.acting_match_team_id',
      typeColumn: 'match_events.action_type',
      types: DEATH_CAUSED_TYPES,
    },
    {
      method: 'averageDeathsSufferedByTeam',
      sideColumn: 'match_events.consequence_match_team_id',
      typeColumn: 'match_events.consequence_type',
      types: DEATH_SUFFERED_TYPES,
    },
  ] as const)(
    '$method counts this side’s events of the matching types per match',
    async ({ method, sideColumn, typeColumn, types }) => {
      const { db, chains } = await build([]);
      await service[method](FACT_SCOPE_ALL_TIME, 'desc', 21);
      const average = selectedAverage(db);
      expect(sqlText(average)).toContain(
        'round(sum(coalesce(side_event_counts.event_count, 0))::numeric',
      );
      expect(extractJoinColumns(average)).toEqual(['matches.id']);

      expect(chains[0].leftJoin).toHaveBeenCalledTimes(1);
      const derivedTable = firstCallArg(chains[0].leftJoin, 0, 0);
      const derivedText = sqlText(derivedTable);
      expect(derivedText).toMatch(
        /^\(select .* as match_team_id, count\(\*\) as event_count from /,
      );
      expect(derivedText).toContain(' group by ');
      expect(derivedText).toMatch(/\) as side_event_counts$/);
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

  it('averageLastingInjuriesCausedByTeam counts this side’s casualty actions whose own row carries a lasting consequence', async () => {
    const { db, chains } = await build([]);
    await service.averageLastingInjuriesCausedByTeam(
      FACT_SCOPE_ALL_TIME,
      'desc',
      21,
    );
    expect(sqlText(selectedAverage(db))).toContain(
      'round(sum(coalesce(side_event_counts.event_count, 0))::numeric',
    );

    expect(chains[0].leftJoin).toHaveBeenCalledTimes(1);
    const derivedTable = firstCallArg(chains[0].leftJoin, 0, 0);
    expect(sqlText(derivedTable)).toContain(' and ');
    // Grouped by the acting side; filtered on the action and the consequence.
    expect(extractJoinColumns(derivedTable)).toEqual([
      'match_events.acting_match_team_id',
      'match_events.action_type',
      'match_events.consequence_type',
      'match_events.acting_match_team_id',
    ]);
    expect(extractAllFilterValues(derivedTable)).toEqual([
      ...CASUALTY_CAUSED_TYPES,
      ...LASTING_INJURY_SUFFERED_TYPES,
    ]);
  });
});
