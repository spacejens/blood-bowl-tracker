import type { Db } from '@blood-bowl-tracker/db';
import { describe, expect, it, vi } from 'vitest';

import {
  countMatchEventsByPlayer,
  countMatchEventsByTeam,
} from './match-event-counts';
import {
  extractAllFilterValues,
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
      countMatchEventsByPlayer(db, { role: 'acting', types: ['touchdown'] }),
    ).resolves.toEqual(rows);
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('joins four tables for the acting role', async () => {
    const builder = makeQueryBuilder([]);
    const db = { select: vi.fn(() => builder) } as unknown as Db;
    await countMatchEventsByPlayer(db, {
      role: 'acting',
      types: ['touchdown'],
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
    await countMatchEventsByPlayer(db, {
      role: 'consequence',
      types: ['sent_off'],
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
      countMatchEventsByTeam(db, { role: 'acting', types: ['touchdown'] }),
    ).resolves.toEqual(rows);
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('joins four tables for the consequence role', async () => {
    const builder = makeQueryBuilder([]);
    const db = { select: vi.fn(() => builder) } as unknown as Db;
    await countMatchEventsByTeam(db, { role: 'consequence', types: ['death'] });
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
