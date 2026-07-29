import { describe, expect, it } from 'vitest';

import { mockDb } from './db-mock.test-helpers';
import { getPlayerContextNamesByIds } from './player-context-names';
import {
  extractFilterValues,
  extractJoinColumns,
  firstCallArg,
} from './query-assertions.test-helpers';

const griff = {
  playerId: 1,
  positionName: 'Blitzer',
  teamName: 'Reikland Reavers',
  raceName: 'Human',
  eraName: 'First era',
  coachName: 'Roze Madder',
};
const morg = {
  playerId: 2,
  positionName: 'Star Player',
  teamName: 'Da Green Machine',
  raceName: 'Orc',
  eraName: 'Second era',
  coachName: 'Skarsnik',
};

describe('getPlayerContextNamesByIds', () => {
  it('maps each returned row to its context names, keyed by player id', async () => {
    const { db } = mockDb([griff, morg]);
    const names = await getPlayerContextNamesByIds({ db, playerIds: [1, 2] });
    expect(names.get(1)).toEqual({
      positionName: 'Blitzer',
      teamName: 'Reikland Reavers',
      raceName: 'Human',
      eraName: 'First era',
      coachName: 'Roze Madder',
    });
    expect(names.get(2)).toEqual({
      positionName: 'Star Player',
      teamName: 'Da Green Machine',
      raceName: 'Orc',
      eraName: 'Second era',
      coachName: 'Skarsnik',
    });
    expect(names.size).toBe(2);
  });

  it('joins position, team era, team, race, coach and era, filtering on the requested ids', async () => {
    const { db, chains } = mockDb([]);
    await getPlayerContextNamesByIds({ db, playerIds: [4, 7] });
    expect(db.select).toHaveBeenCalledTimes(1);
    expect(chains[0].innerJoin).toHaveBeenCalledTimes(6);
    expect(extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1))).toEqual(
      ['positions.id', 'players.position_id'],
    );
    expect(extractJoinColumns(firstCallArg(chains[0].innerJoin, 1, 1))).toEqual(
      ['team_eras.id', 'players.team_era_id'],
    );
    expect(extractJoinColumns(firstCallArg(chains[0].innerJoin, 2, 1))).toEqual(
      ['teams.id', 'team_eras.team_id'],
    );
    expect(extractJoinColumns(firstCallArg(chains[0].innerJoin, 3, 1))).toEqual(
      ['races.id', 'teams.race_id'],
    );
    expect(extractJoinColumns(firstCallArg(chains[0].innerJoin, 4, 1))).toEqual(
      ['coaches.id', 'teams.coach_id'],
    );
    expect(extractJoinColumns(firstCallArg(chains[0].innerJoin, 5, 1))).toEqual(
      ['eras.id', 'team_eras.era_id'],
    );
    expect(extractFilterValues(firstCallArg(chains[0].where))).toEqual([4, 7]);
  });

  it('returns an empty map without querying when no player ids are given', async () => {
    const { db } = mockDb([]);
    const names = await getPlayerContextNamesByIds({ db, playerIds: [] });
    expect(names.size).toBe(0);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('omits a player the query returned no row for', async () => {
    const { db } = mockDb([griff]);
    const names = await getPlayerContextNamesByIds({ db, playerIds: [1, 99] });
    expect(names.get(99)).toBeUndefined();
  });
});
