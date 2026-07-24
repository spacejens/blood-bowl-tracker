import type { Db } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { QueryChain } from '../shared/db-mock.test-helpers';
import { mockDb } from '../shared/db-mock.test-helpers';
import { LikePatternService } from '../shared/like-pattern.service';
import {
  extractFilterValues,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import { TeamsService } from './teams.service';

describe('TeamsService lookups', () => {
  let service: TeamsService;
  let likePattern: MockProxy<LikePatternService>;

  async function build(...rowsPerQuery: unknown[][]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [
        TeamsService,
        { provide: LikePatternService, useValue: likePattern },
        { provide: DB, useValue: db },
      ],
    }).compile();
    service = moduleRef.get(TeamsService);
    return { db, chains };
  }

  beforeEach(() => {
    likePattern = mock<LikePatternService>();
  });

  describe('searchByNamePrefix', () => {
    it('returns id/name choices for a name prefix, capped to the limit', async () => {
      const rows = [
        { id: 1, name: '40 grinders' },
        { id: 2, name: '4th Down Doom' },
      ];
      likePattern.escape.mockReturnValue('4');
      const { chains } = await build(rows);
      await expect(service.searchByNamePrefix('4', 25)).resolves.toEqual(rows);
      expect(chains[0].limit).toHaveBeenCalledWith(25);
    });
  });

  describe('findById', () => {
    it('returns the team with its race and coach names and ids', async () => {
      const row = {
        id: 7,
        name: '40 grinders',
        raceName: 'Dwarf',
        raceId: 4,
        coachName: 'Roze Madder',
        coachId: 12,
      };
      const { db, chains } = await build([row]);
      await expect(service.findById(7)).resolves.toEqual(row);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(7);
      const selectArg = firstCallArg(db.select, 0, 0) as Record<
        string,
        unknown
      >;
      expect(Object.keys(selectArg)).toEqual(
        expect.arrayContaining(['raceId', 'coachId']),
      );
    });

    it('returns undefined when no team matches', async () => {
      const { chains } = await build([]);
      await expect(service.findById(999)).resolves.toBeUndefined();
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(999);
    });
  });

  describe('getCareerSpan', () => {
    it('returns the min/max match dates for the team', async () => {
      const { chains } = await build([
        { start: '2021-09-01', end: '2023-06-10' },
      ]);
      await expect(service.getCareerSpan(7)).resolves.toEqual({
        start: '2021-09-01',
        end: '2023-06-10',
      });
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(7);
    });

    it('returns undefined when the team has played no matches', async () => {
      await build([{ start: null, end: null }]);
      await expect(service.getCareerSpan(7)).resolves.toBeUndefined();
    });
  });

  describe('getTopPlayersByMatchEventCount', () => {
    it('returns players ranked by total match events, capped to the limit', async () => {
      const rows = [
        { playerId: 1, name: 'Griff', count: 20 },
        { playerId: 2, name: 'Morg', count: 11 },
      ];
      const { chains } = await build(rows);
      await expect(
        service.getTopPlayersByMatchEventCount(7, 10),
      ).resolves.toEqual(rows);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(7);
      expect(chains[0].limit).toHaveBeenCalledWith(10);
    });

    it('sums events of different types into one total per player', async () => {
      // The query GROUP BYs the player and COUNTs every matched row regardless
      // of action type, so a player with touchdowns + casualties + fouls
      // surfaces as a single summed count. The mock returns the already-summed
      // shape the SQL would produce; this pins the pass-through and limit.
      const rows = [{ playerId: 1, name: 'Griff', count: 37 }];
      const { chains } = await build(rows);
      await expect(
        service.getTopPlayersByMatchEventCount(7, 10),
      ).resolves.toEqual(rows);
      expect(chains[0].limit).toHaveBeenCalledWith(10);
    });
  });
});
