import type { Db } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import type { QueryChain } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { PlayerContextNamesService } from './player-context-names.service';
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

describe('PlayerContextNamesService', () => {
  let service: PlayerContextNamesService;

  async function build(...rowsPerQuery: unknown[][]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [PlayerContextNamesService, { provide: DB, useValue: db }],
    }).compile();
    service = moduleRef.get(PlayerContextNamesService);
    return { db, chains };
  }

  it('maps each returned row to its context names, keyed by player id', async () => {
    await build([griff, morg]);
    const names = await service.getPlayerContextNamesByIds([1, 2]);
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
    const { db, chains } = await build([]);
    await service.getPlayerContextNamesByIds([4, 7]);
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
    const { db } = await build([]);
    const names = await service.getPlayerContextNamesByIds([]);
    expect(names.size).toBe(0);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('omits a player the query returned no row for', async () => {
    await build([griff]);
    const names = await service.getPlayerContextNamesByIds([1, 99]);
    expect(names.get(99)).toBeUndefined();
  });
});
