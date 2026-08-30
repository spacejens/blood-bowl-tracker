import type { Db } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import type { QueryChain } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { FACT_SCOPE_ALL_TIME } from '../shared/fact-scope';
import { MatchScopeFilterService } from '../shared/match-scope-filter.service';
import {
  extractAllFilterValues,
  extractJoinColumns,
  firstCallArg,
  sqlText,
} from '../shared/query-assertions.test-helpers';
import { DateToplistService } from './date-toplist.service';

describe('DateToplistService', () => {
  const rows = [
    { month: 2, day: 29, count: 12 },
    { month: 6, day: 1, count: 9 },
  ];

  async function build(...rowsPerQuery: unknown[][]): Promise<{
    service: DateToplistService;
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [
        DateToplistService,
        MatchScopeFilterService,
        { provide: DB, useValue: db },
      ],
    }).compile();
    return { service: moduleRef.get(DateToplistService), db, chains };
  }

  it('returns the rows the query produces, descending', async () => {
    const { service } = await build(rows);
    await expect(
      service.getMatchCountsByDateDescending(FACT_SCOPE_ALL_TIME, 21),
    ).resolves.toEqual(rows);
  });

  it('returns the rows the query produces, ascending', async () => {
    const { service } = await build(rows);
    await expect(
      service.getMatchCountsByDateAscending(FACT_SCOPE_ALL_TIME, 21),
    ).resolves.toEqual(rows);
  });

  it('counts distinct matches, so the match-teams join cannot double-count', async () => {
    const { service, db } = await build(rows);
    await service.getMatchCountsByDateDescending(FACT_SCOPE_ALL_TIME, 21);
    const fields = firstCallArg(db.select) as {
      month: unknown;
      day: unknown;
      count: unknown;
    };
    expect(sqlText(fields.count)).toContain('distinct');
  });

  it('extracts the month and day in UTC, matching the on-this-date filter', async () => {
    const { service, db } = await build(rows);
    await service.getMatchCountsByDateDescending(FACT_SCOPE_ALL_TIME, 21);
    const fields = firstCallArg(db.select) as {
      month: unknown;
      day: unknown;
    };
    expect(sqlText(fields.month)).toContain('extract(month from');
    expect(sqlText(fields.month)).toContain("at time zone 'UTC'");
    expect(sqlText(fields.day)).toContain('extract(day from');
    expect(sqlText(fields.day)).toContain("at time zone 'UTC'");
  });

  it('joins matches through match teams, team eras and eras so the scope filter can apply', async () => {
    const { service, chains } = await build(rows);
    await service.getMatchCountsByDateDescending(FACT_SCOPE_ALL_TIME, 21);
    expect(extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1))).toEqual(
      ['match_teams.match_id', 'matches.id'],
    );
    expect(extractJoinColumns(firstCallArg(chains[0].innerJoin, 1, 1))).toEqual(
      ['team_eras.id', 'match_teams.team_era_id'],
    );
    expect(extractJoinColumns(firstCallArg(chains[0].innerJoin, 2, 1))).toEqual(
      ['eras.id', 'team_eras.era_id'],
    );
  });

  it('groups by the extracted month and day', async () => {
    const { service, chains } = await build(rows);
    await service.getMatchCountsByDateDescending(FACT_SCOPE_ALL_TIME, 21);
    expect(chains[0].groupBy).toHaveBeenCalledTimes(1);
    const groupBy = chains[0].groupBy.mock.calls[0];
    expect(sqlText(groupBy[0])).toContain('extract(month from');
    expect(sqlText(groupBy[1])).toContain('extract(day from');
  });

  it('orders the descending toplist by count descending, then chronologically for stable ties', async () => {
    const { service, chains } = await build(rows);
    await service.getMatchCountsByDateDescending(FACT_SCOPE_ALL_TIME, 21);
    const orderBy = chains[0].orderBy.mock.calls[0];
    expect(sqlText(orderBy[0])).toContain(' desc');
    expect(sqlText(orderBy[1])).toContain('extract(month from');
    expect(sqlText(orderBy[2])).toContain('extract(day from');
  });

  it('orders the ascending toplist by count ascending, then chronologically for stable ties', async () => {
    const { service, chains } = await build(rows);
    await service.getMatchCountsByDateAscending(FACT_SCOPE_ALL_TIME, 21);
    const orderBy = chains[0].orderBy.mock.calls[0];
    expect(sqlText(orderBy[0])).toContain(' asc');
    expect(sqlText(orderBy[0])).not.toContain(' desc');
    expect(sqlText(orderBy[1])).toContain('extract(month from');
    expect(sqlText(orderBy[2])).toContain('extract(day from');
  });

  it('applies the caller limit', async () => {
    const { service, chains } = await build(rows);
    await service.getMatchCountsByDateDescending(FACT_SCOPE_ALL_TIME, 21);
    expect(chains[0].limit).toHaveBeenCalledWith(21);
  });

  it('applies no filter when the scope is all-time', async () => {
    const { service, chains } = await build(rows);
    await service.getMatchCountsByDateDescending(FACT_SCOPE_ALL_TIME, 21);
    expect(firstCallArg(chains[0].where)).toBeUndefined();
  });

  it('filters by league, era, competition and match category through the shared scope filter', async () => {
    const league = await build(rows);
    await league.service.getMatchCountsByDateDescending({ leagueId: 9 }, 21);
    expect(
      extractAllFilterValues(firstCallArg(league.chains[0].where)),
    ).toContain(9);

    const era = await build(rows);
    await era.service.getMatchCountsByDateDescending({ eraId: 20 }, 21);
    expect(extractAllFilterValues(firstCallArg(era.chains[0].where))).toContain(
      20,
    );

    const competition = await build(rows);
    await competition.service.getMatchCountsByDateAscending(
      { competitionId: 7 },
      21,
    );
    expect(
      extractAllFilterValues(firstCallArg(competition.chains[0].where)),
    ).toContain(7);

    const category = await build(rows);
    await category.service.getMatchCountsByDateAscending(
      { category: 'cup_final' },
      21,
    );
    expect(
      extractAllFilterValues(firstCallArg(category.chains[0].where)),
    ).toContain('cup_final');
  });
});
