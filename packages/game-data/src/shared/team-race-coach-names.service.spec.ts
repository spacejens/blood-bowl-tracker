import type { Db } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import type { QueryChain } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import {
  extractFilterValues,
  extractJoinColumns,
  firstCallArg,
} from './query-assertions.test-helpers';
import { TeamRaceCoachNamesService } from './team-race-coach-names.service';

describe('TeamRaceCoachNamesService', () => {
  let service: TeamRaceCoachNamesService;

  async function build(...rowsPerQuery: unknown[][]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [TeamRaceCoachNamesService, { provide: DB, useValue: db }],
    }).compile();
    service = moduleRef.get(TeamRaceCoachNamesService);
    return { db, chains };
  }

  it('maps each returned row to its race and coach names, keyed by team id', async () => {
    await build([
      { teamId: 1, raceName: 'Orc', coachName: 'Skarsnik' },
      { teamId: 2, raceName: 'Dwarf', coachName: 'Roze Madder' },
    ]);
    const names = await service.getRaceAndCoachNamesByIds([1, 2]);
    expect(names.get(1)).toEqual({ raceName: 'Orc', coachName: 'Skarsnik' });
    expect(names.get(2)).toEqual({
      raceName: 'Dwarf',
      coachName: 'Roze Madder',
    });
    expect(names.size).toBe(2);
  });

  it('joins races and coaches onto teams and filters on the requested ids', async () => {
    const { db, chains } = await build([]);
    await service.getRaceAndCoachNamesByIds([4, 7]);
    expect(db.select).toHaveBeenCalledTimes(1);
    expect(chains[0].innerJoin).toHaveBeenCalledTimes(2);
    expect(extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1))).toEqual(
      ['races.id', 'teams.race_id'],
    );
    expect(extractJoinColumns(firstCallArg(chains[0].innerJoin, 1, 1))).toEqual(
      ['coaches.id', 'teams.coach_id'],
    );
    expect(extractFilterValues(firstCallArg(chains[0].where))).toEqual([4, 7]);
  });

  it('returns an empty map without querying when no team ids are given', async () => {
    const { db } = await build([]);
    const names = await service.getRaceAndCoachNamesByIds([]);
    expect(names.size).toBe(0);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('omits a team the query returned no row for', async () => {
    await build([{ teamId: 1, raceName: 'Orc', coachName: 'Skarsnik' }]);
    const names = await service.getRaceAndCoachNamesByIds([1, 99]);
    expect(names.get(99)).toBeUndefined();
  });
});
