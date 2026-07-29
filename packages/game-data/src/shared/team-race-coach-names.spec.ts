import { describe, expect, it } from 'vitest';

import { mockDb } from './db-mock.test-helpers';
import {
  extractFilterValues,
  extractJoinColumns,
  firstCallArg,
} from './query-assertions.test-helpers';
import { getRaceAndCoachNamesByIds } from './team-race-coach-names';

describe('getRaceAndCoachNamesByIds', () => {
  it('maps each returned row to its race and coach names, keyed by team id', async () => {
    const { db } = mockDb([
      { teamId: 1, raceName: 'Orc', coachName: 'Skarsnik' },
      { teamId: 2, raceName: 'Dwarf', coachName: 'Roze Madder' },
    ]);
    const names = await getRaceAndCoachNamesByIds({ db, teamIds: [1, 2] });
    expect(names.get(1)).toEqual({ raceName: 'Orc', coachName: 'Skarsnik' });
    expect(names.get(2)).toEqual({
      raceName: 'Dwarf',
      coachName: 'Roze Madder',
    });
    expect(names.size).toBe(2);
  });

  it('joins races and coaches onto teams and filters on the requested ids', async () => {
    const { db, chains } = mockDb([]);
    await getRaceAndCoachNamesByIds({ db, teamIds: [4, 7] });
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
    const { db } = mockDb([]);
    const names = await getRaceAndCoachNamesByIds({ db, teamIds: [] });
    expect(names.size).toBe(0);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('omits a team the query returned no row for', async () => {
    const { db } = mockDb([
      { teamId: 1, raceName: 'Orc', coachName: 'Skarsnik' },
    ]);
    const names = await getRaceAndCoachNamesByIds({ db, teamIds: [1, 99] });
    expect(names.get(99)).toBeUndefined();
  });
});
