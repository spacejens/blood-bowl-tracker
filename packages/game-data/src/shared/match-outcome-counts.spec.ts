import { describe, expect, it } from 'vitest';

import { mockDb } from './db-mock.test-helpers';
import { FACT_SCOPE_ALL_TIME } from './fact-scope';
import {
  countMatchesWithOutcomeByCoach,
  countMatchesWithOutcomeByRace,
  countMatchesWithOutcomeByTeam,
} from './match-outcome-counts';
import {
  extractAllFilterValues,
  extractJoinColumns,
  firstCallArg,
} from './query-assertions.test-helpers';

describe('countMatchesWithOutcomeByCoach', () => {
  it('returns the rows the query resolves to', async () => {
    const rows = [
      { coachId: 1, name: 'Roze Madder', count: 7 },
      { coachId: 2, name: 'Grashnak', count: 3 },
    ];
    const { db } = mockDb(rows);
    await expect(
      countMatchesWithOutcomeByCoach({
        db,
        outcome: 'won',
        scope: FACT_SCOPE_ALL_TIME,
        limit: 21,
      }),
    ).resolves.toEqual(rows);
  });

  it('joins coaches through match_teams, team_eras, eras and teams', async () => {
    const { db, chains } = mockDb([]);
    await countMatchesWithOutcomeByCoach({
      db,
      outcome: 'won',
      scope: FACT_SCOPE_ALL_TIME,
      limit: 21,
    });
    expect(db.select).toHaveBeenCalledTimes(1);
    expect(chains[0].innerJoin).toHaveBeenCalledTimes(5);
    expect(extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1))).toEqual(
      ['match_teams.match_id', 'matches.id'],
    );
    expect(extractJoinColumns(firstCallArg(chains[0].innerJoin, 4, 1))).toEqual(
      ['coaches.id', 'teams.coach_id'],
    );
    expect(chains[0].limit).toHaveBeenCalledWith(21);
  });

  it('filters a won count on the coach own match_teams row', async () => {
    const { db, chains } = mockDb([]);
    await countMatchesWithOutcomeByCoach({
      db,
      outcome: 'won',
      scope: FACT_SCOPE_ALL_TIME,
      limit: 21,
    });
    expect(extractJoinColumns(firstCallArg(chains[0].where))).toEqual([
      'matches.winning_match_team_id',
      'match_teams.id',
    ]);
  });

  it('filters a lost count on a non-null winner that is not the coach own row', async () => {
    const { db, chains } = mockDb([]);
    await countMatchesWithOutcomeByCoach({
      db,
      outcome: 'lost',
      scope: FACT_SCOPE_ALL_TIME,
      limit: 21,
    });
    expect(extractJoinColumns(firstCallArg(chains[0].where))).toEqual([
      'matches.winning_match_team_id',
      'matches.winning_match_team_id',
      'match_teams.id',
    ]);
  });

  it('filters a drawn count on a null winner', async () => {
    const { db, chains } = mockDb([]);
    await countMatchesWithOutcomeByCoach({
      db,
      outcome: 'drawn',
      scope: FACT_SCOPE_ALL_TIME,
      limit: 21,
    });
    expect(extractJoinColumns(firstCallArg(chains[0].where))).toEqual([
      'matches.winning_match_team_id',
    ]);
  });

  it('applies the league, era and match-category scope filters', async () => {
    const { db, chains } = mockDb([], [], []);
    await countMatchesWithOutcomeByCoach({
      db,
      outcome: 'won',
      scope: { leagueId: 9 },
      limit: 21,
    });
    await countMatchesWithOutcomeByCoach({
      db,
      outcome: 'won',
      scope: { eraId: 20 },
      limit: 21,
    });
    await countMatchesWithOutcomeByCoach({
      db,
      outcome: 'won',
      scope: { category: 'season_final' },
      limit: 21,
    });
    expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([9]);
    expect(extractAllFilterValues(firstCallArg(chains[1].where))).toEqual([20]);
    expect(extractAllFilterValues(firstCallArg(chains[2].where))).toEqual([
      'season_final',
    ]);
  });
});

describe('countMatchesWithOutcomeByTeam', () => {
  it('returns the rows the query resolves to', async () => {
    const rows = [{ teamId: 1, name: '40 grinders', count: 5 }];
    const { db } = mockDb(rows);
    await expect(
      countMatchesWithOutcomeByTeam({
        db,
        outcome: 'drawn',
        scope: FACT_SCOPE_ALL_TIME,
        limit: 21,
      }),
    ).resolves.toEqual(rows);
  });

  it('groups by team without joining coaches', async () => {
    const { db, chains } = mockDb([]);
    await countMatchesWithOutcomeByTeam({
      db,
      outcome: 'won',
      scope: FACT_SCOPE_ALL_TIME,
      limit: 21,
    });
    expect(chains[0].innerJoin).toHaveBeenCalledTimes(4);
    expect(extractJoinColumns(firstCallArg(chains[0].innerJoin, 3, 1))).toEqual(
      ['teams.id', 'team_eras.team_id'],
    );
    expect(chains[0].limit).toHaveBeenCalledWith(21);
  });

  it('filters a lost count on a non-null winner that is not the team own row', async () => {
    const { db, chains } = mockDb([]);
    await countMatchesWithOutcomeByTeam({
      db,
      outcome: 'lost',
      scope: FACT_SCOPE_ALL_TIME,
      limit: 21,
    });
    expect(extractJoinColumns(firstCallArg(chains[0].where))).toEqual([
      'matches.winning_match_team_id',
      'matches.winning_match_team_id',
      'match_teams.id',
    ]);
  });
});

describe('countMatchesWithOutcomeByRace', () => {
  it('returns the rows the query resolves to', async () => {
    const rows = [{ raceId: 1, name: 'Orc', count: 11 }];
    const { db } = mockDb(rows);
    await expect(
      countMatchesWithOutcomeByRace({
        db,
        outcome: 'won',
        scope: FACT_SCOPE_ALL_TIME,
        limit: 21,
      }),
    ).resolves.toEqual(rows);
  });

  it('keeps the matches join last so it counts one participation per team', async () => {
    const { db, chains } = mockDb([]);
    await countMatchesWithOutcomeByRace({
      db,
      outcome: 'won',
      scope: FACT_SCOPE_ALL_TIME,
      limit: 21,
    });
    expect(chains[0].innerJoin).toHaveBeenCalledTimes(5);
    expect(extractJoinColumns(firstCallArg(chains[0].innerJoin, 4, 1))).toEqual(
      ['matches.id', 'match_teams.match_id'],
    );
    expect(chains[0].limit).toHaveBeenCalledWith(21);
  });

  it('filters a drawn count on a null winner', async () => {
    const { db, chains } = mockDb([]);
    await countMatchesWithOutcomeByRace({
      db,
      outcome: 'drawn',
      scope: FACT_SCOPE_ALL_TIME,
      limit: 21,
    });
    expect(extractJoinColumns(firstCallArg(chains[0].where))).toEqual([
      'matches.winning_match_team_id',
    ]);
  });
});
