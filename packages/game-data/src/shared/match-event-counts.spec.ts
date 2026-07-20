import type { Db } from '@blood-bowl-tracker/db';
import { describe, expect, it, vi } from 'vitest';

import {
  countAllMatchEventsByPlayerForTeam,
  countMatchEventsByPlayer,
  countMatchEventsByTeam,
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
      }),
    ).resolves.toEqual(rows);
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('joins four tables for the acting role', async () => {
    const builder = makeQueryBuilder([]);
    const db = { select: vi.fn(() => builder) } as unknown as Db;
    await countMatchEventsByPlayer({
      db,
      selector: { role: 'acting', types: ['touchdown'] },
    });
    expect(builder.innerJoin).toHaveBeenCalledTimes(4);
    expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual([
      'players.id',
      'match_events.acting_player_id',
    ]);
    expect(builder.where).toHaveBeenCalledTimes(1);
    expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
      'touchdown',
    ]);
  });

  it('joins four tables for the consequence role', async () => {
    const builder = makeQueryBuilder([]);
    const db = { select: vi.fn(() => builder) } as unknown as Db;
    await countMatchEventsByPlayer({
      db,
      selector: { role: 'consequence', types: ['sent_off'] },
    });
    expect(builder.innerJoin).toHaveBeenCalledTimes(4);
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
      }),
    ).resolves.toEqual(rows);
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('joins four tables for the consequence role', async () => {
    const builder = makeQueryBuilder([]);
    const db = { select: vi.fn(() => builder) } as unknown as Db;
    await countMatchEventsByTeam({
      db,
      selector: { role: 'consequence', types: ['death'] },
    });
    expect(builder.innerJoin).toHaveBeenCalledTimes(4);
    expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual([
      'match_teams.id',
      'match_events.consequence_match_team_id',
    ]);
    expect(builder.where).toHaveBeenCalledTimes(1);
    expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
      'death',
    ]);
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
