import type { Db } from '@blood-bowl-tracker/db';
import { describe, expect, it, vi } from 'vitest';

import {
  countAllMatchEventsByPlayerForTeam,
  countMatchEventsByCoach,
  countMatchEventsByPlayer,
  countMatchEventsByTeam,
  countMatchEventsForPlayer,
  listBiggestExpensiveMistakes,
  sumExpensiveMistakesByTeam,
} from './match-event-counts';
import {
  extractAllFilterValues,
  extractFilterValues,
  extractJoinColumns,
  firstCallArg,
} from './query-assertions.test-helpers';

function makeQueryBuilder(rows: unknown[]): Record<string, unknown> {
  const builder: Record<string, unknown> = {};
  builder.from = vi.fn(() => builder);
  builder.innerJoin = vi.fn(() => builder);
  builder.where = vi.fn(() => builder);
  builder.groupBy = vi.fn(() => builder);
  builder.orderBy = vi.fn(() => builder);
  builder.limit = vi.fn(() => builder);
  builder.then = (
    resolve: (v: unknown) => unknown,
    reject: (e: unknown) => unknown,
  ) => Promise.resolve(rows).then(resolve, reject);
  return builder;
}

describe('countMatchEventsByPlayer', () => {
  it('returns the rows the query resolves to', async () => {
    const rows = [{ playerId: 1, name: 'Griff Oberwald', count: 7 }];
    const select = vi.fn(() => makeQueryBuilder(rows));
    const db = { select } as unknown as Db;
    await expect(
      countMatchEventsByPlayer({
        db,
        selector: { role: 'acting', types: ['touchdown'] },
        limit: 21,
      }),
    ).resolves.toEqual(rows);
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('joins five tables for the acting role', async () => {
    const builder = makeQueryBuilder([]);
    const db = { select: vi.fn(() => builder) } as unknown as Db;
    await countMatchEventsByPlayer({
      db,
      selector: { role: 'acting', types: ['touchdown'] },
      limit: 21,
    });
    expect(builder.innerJoin).toHaveBeenCalledTimes(5);
    expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual([
      'players.id',
      'match_events.acting_player_id',
    ]);
    expect(builder.where).toHaveBeenCalledTimes(1);
    expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
      'touchdown',
    ]);
  });

  it('applies the SQL limit to the query', async () => {
    const builder = makeQueryBuilder([]);
    const db = { select: vi.fn(() => builder) } as unknown as Db;
    await countMatchEventsByPlayer({
      db,
      selector: { role: 'acting', types: ['touchdown'] },
      limit: 21,
    });
    expect(builder.limit).toHaveBeenCalledWith(21);
  });

  it('joins five tables for the consequence role', async () => {
    const builder = makeQueryBuilder([]);
    const db = { select: vi.fn(() => builder) } as unknown as Db;
    await countMatchEventsByPlayer({
      db,
      selector: { role: 'consequence', types: ['sent_off'] },
      limit: 21,
    });
    expect(builder.innerJoin).toHaveBeenCalledTimes(5);
    expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual([
      'players.id',
      'match_events.consequence_player_id',
    ]);
    expect(builder.where).toHaveBeenCalledTimes(1);
    expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
      'sent_off',
    ]);
  });
});

describe('countMatchEventsByTeam', () => {
  it('returns the rows the query resolves to', async () => {
    const rows = [{ teamId: 1, name: 'Reikland Reavers', count: 4 }];
    const select = vi.fn(() => makeQueryBuilder(rows));
    const db = { select } as unknown as Db;
    await expect(
      countMatchEventsByTeam({
        db,
        selector: { role: 'acting', types: ['touchdown'] },
        limit: 21,
      }),
    ).resolves.toEqual(rows);
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('joins five tables for the consequence role', async () => {
    const builder = makeQueryBuilder([]);
    const db = { select: vi.fn(() => builder) } as unknown as Db;
    await countMatchEventsByTeam({
      db,
      selector: { role: 'consequence', types: ['death'] },
      limit: 21,
    });
    expect(builder.innerJoin).toHaveBeenCalledTimes(5);
    expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual([
      'match_teams.id',
      'match_events.consequence_match_team_id',
    ]);
    expect(builder.where).toHaveBeenCalledTimes(1);
    expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
      'death',
    ]);
  });

  it('applies the SQL limit to the query', async () => {
    const builder = makeQueryBuilder([]);
    const db = { select: vi.fn(() => builder) } as unknown as Db;
    await countMatchEventsByTeam({
      db,
      selector: { role: 'acting', types: ['touchdown'] },
      limit: 21,
    });
    expect(builder.limit).toHaveBeenCalledWith(21);
  });

  it('filters by league via the eras join when a leagueId is given', async () => {
    const builder = makeQueryBuilder([]);
    const db = { select: vi.fn(() => builder) } as unknown as Db;
    await countMatchEventsByTeam({
      db,
      selector: { role: 'acting', types: ['touchdown'] },
      leagueId: 9,
      limit: 21,
    });
    expect(builder.where).toHaveBeenCalledTimes(1);
    expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
      'touchdown',
      9,
    ]);
    expect(
      extractJoinColumns(firstCallArg(builder.where)).filter(
        (column) => column === 'eras.league_id',
      ),
    ).toHaveLength(1);
  });
});

describe('countMatchEventsByCoach', () => {
  it('returns the rows the query resolves to', async () => {
    const rows = [{ coachId: 1, name: 'Roze Madder', count: 13 }];
    const select = vi.fn(() => makeQueryBuilder(rows));
    const db = { select } as unknown as Db;
    await expect(
      countMatchEventsByCoach({
        db,
        selector: { role: 'acting', types: ['foul'] },
        limit: 21,
      }),
    ).resolves.toEqual(rows);
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('joins six tables for the acting role, reaching coaches through teams', async () => {
    const builder = makeQueryBuilder([]);
    const db = { select: vi.fn(() => builder) } as unknown as Db;
    await countMatchEventsByCoach({
      db,
      selector: { role: 'acting', types: ['foul'] },
      limit: 21,
    });
    // One more join than countMatchEventsByTeam: teams -> coaches.
    expect(builder.innerJoin).toHaveBeenCalledTimes(6);
    expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual([
      'match_teams.id',
      'match_events.acting_match_team_id',
    ]);
    expect(extractJoinColumns(firstCallArg(builder.innerJoin, 5, 1))).toEqual([
      'coaches.id',
      'teams.coach_id',
    ]);
    expect(builder.where).toHaveBeenCalledTimes(1);
    expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
      'foul',
    ]);
  });

  it('joins the consequence side when the selector role is consequence', async () => {
    const builder = makeQueryBuilder([]);
    const db = { select: vi.fn(() => builder) } as unknown as Db;
    await countMatchEventsByCoach({
      db,
      selector: { role: 'consequence', types: ['death'] },
      limit: 21,
    });
    expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual([
      'match_teams.id',
      'match_events.consequence_match_team_id',
    ]);
    expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
      'death',
    ]);
  });

  it('applies the SQL limit to the query', async () => {
    const builder = makeQueryBuilder([]);
    const db = { select: vi.fn(() => builder) } as unknown as Db;
    await countMatchEventsByCoach({
      db,
      selector: { role: 'acting', types: ['foul'] },
      limit: 21,
    });
    expect(builder.limit).toHaveBeenCalledWith(21);
  });

  it('filters by league, era and competition when the scope is given', async () => {
    const builder = makeQueryBuilder([]);
    const db = { select: vi.fn(() => builder) } as unknown as Db;
    await countMatchEventsByCoach({
      db,
      selector: { role: 'acting', types: ['foul'] },
      leagueId: 9,
      eraId: 20,
      competitionId: 30,
      limit: 21,
    });
    expect(builder.where).toHaveBeenCalledTimes(1);
    expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
      'foul',
      9,
      20,
      30,
    ]);
    expect(
      extractJoinColumns(firstCallArg(builder.where)).filter(
        (column) => column === 'eras.league_id',
      ),
    ).toHaveLength(1);
  });
});

describe('countAllMatchEventsByPlayerForTeam', () => {
  function makeBuilder(rows: unknown[]) {
    const builder: Record<string, unknown> = {};
    builder.from = vi.fn(() => builder);
    builder.innerJoin = vi.fn(() => builder);
    builder.where = vi.fn(() => builder);
    builder.groupBy = vi.fn(() => builder);
    builder.orderBy = vi.fn(() => builder);
    builder.limit = vi.fn(() => Promise.resolve(rows));
    return builder;
  }

  it('counts every acting event per player for the team, capped to the limit', async () => {
    const rows = [
      { playerId: 1, name: 'Griff', count: 20 },
      { playerId: 2, name: 'Morg', count: 11 },
    ];
    const builder = makeBuilder(rows);
    const db = { select: vi.fn(() => builder) } as unknown as Db;
    await expect(
      countAllMatchEventsByPlayerForTeam({ db, teamId: 7, limit: 10 }),
    ).resolves.toEqual(rows);
    expect(extractFilterValues(firstCallArg(builder.where))).toBe(7);
    expect(builder.limit).toHaveBeenCalledWith(10);
  });

  it('passes a generous limit through so a tie at the cutoff can be detected downstream', async () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({
      playerId: i + 1,
      name: `Player ${i + 1}`,
      count: i < 6 ? 5 : 1,
    }));
    const builder = makeBuilder(rows);
    const db = { select: vi.fn(() => builder) } as unknown as Db;
    await expect(
      countAllMatchEventsByPlayerForTeam({ db, teamId: 7, limit: 10 }),
    ).resolves.toEqual(rows);
    expect(builder.limit).toHaveBeenCalledWith(10);
  });
});

describe('countMatchEventsForPlayer', () => {
  it('returns the single count the query resolves to', async () => {
    const builder = makeQueryBuilder([{ count: 7 }]);
    const db = { select: vi.fn(() => builder) } as unknown as Db;
    await expect(
      countMatchEventsForPlayer({
        db,
        playerId: 1,
        selector: { role: 'acting', types: ['touchdown'] },
      }),
    ).resolves.toBe(7);
  });

  it('filters by the acting player id alongside the type list', async () => {
    const builder = makeQueryBuilder([{ count: 0 }]);
    const db = { select: vi.fn(() => builder) } as unknown as Db;
    await countMatchEventsForPlayer({
      db,
      playerId: 42,
      selector: { role: 'acting', types: ['mvp_award'] },
    });
    expect(builder.innerJoin).toHaveBeenCalledTimes(5);
    expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual([
      'players.id',
      'match_events.acting_player_id',
    ]);
    expect(builder.where).toHaveBeenCalledTimes(1);
    // The where clause folds together the type-list inArray and the
    // eq(players.id, playerId) filter, so both the type and the id appear.
    expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
      'mvp_award',
      42,
    ]);
  });
});

describe('sumExpensiveMistakesByTeam', () => {
  it('applies the SQL limit to the query', async () => {
    const builder = makeQueryBuilder([]);
    const db = { select: vi.fn(() => builder) } as unknown as Db;
    await sumExpensiveMistakesByTeam({ db, limit: 21 });
    expect(builder.limit).toHaveBeenCalledWith(21);
  });

  it('returns the rows the query resolves to', async () => {
    const rows = [{ teamId: 1, name: 'Reikland Reavers', count: 150000 }];
    const builder = makeQueryBuilder(rows);
    const db = { select: vi.fn(() => builder) } as unknown as Db;
    await expect(
      sumExpensiveMistakesByTeam({ db, eraId: 5, competitionId: 6, limit: 21 }),
    ).resolves.toEqual(rows);
  });

  it('filters by league when a leagueId is given', async () => {
    const builder = makeQueryBuilder([]);
    const db = { select: vi.fn(() => builder) } as unknown as Db;
    await sumExpensiveMistakesByTeam({ db, leagueId: 9, limit: 21 });
    expect(builder.where).toHaveBeenCalledTimes(1);
    expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
      'expensive_mistake',
      9,
    ]);
  });
});

describe('listBiggestExpensiveMistakes', () => {
  it('applies the SQL limit to the query', async () => {
    const builder = makeQueryBuilder([]);
    const db = { select: vi.fn(() => builder) } as unknown as Db;
    await listBiggestExpensiveMistakes({ db, limit: 21 });
    expect(builder.limit).toHaveBeenCalledWith(21);
  });

  it('returns the labelled rows the query resolves to', async () => {
    const rows = [
      { teamId: 1, name: 'Reikland Reavers', count: 90000, date: '2026-01-02' },
    ];
    const builder = makeQueryBuilder(rows);
    const db = { select: vi.fn(() => builder) } as unknown as Db;
    await expect(
      listBiggestExpensiveMistakes({ db, limit: 21 }),
    ).resolves.toEqual(rows);
  });

  it('filters by league when a leagueId is given', async () => {
    const builder = makeQueryBuilder([]);
    const db = { select: vi.fn(() => builder) } as unknown as Db;
    await listBiggestExpensiveMistakes({ db, leagueId: 9, limit: 21 });
    expect(builder.where).toHaveBeenCalledTimes(1);
    expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
      'expensive_mistake',
      9,
    ]);
  });
});
