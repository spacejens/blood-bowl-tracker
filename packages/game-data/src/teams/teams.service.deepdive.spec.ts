import type { Db } from '@blood-bowl-tracker/db';
import { describe, expect, it, vi } from 'vitest';

import { LikePatternService } from '../shared/like-pattern.service';
import {
  extractFilterValues,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import { TeamsService } from './teams.service';

describe('TeamsService lookups', () => {
  const likePattern = new LikePatternService();

  describe('searchByNamePrefix', () => {
    it('returns id/name choices for a name prefix, capped to the limit', async () => {
      const rows = [
        { id: 1, name: '40 grinders' },
        { id: 2, name: '4th Down Doom' },
      ];
      const limit = vi.fn().mockResolvedValue(rows);
      const where = vi.fn(() => ({ limit }));
      const from = vi.fn(() => ({ where }));
      const service = new TeamsService(
        {
          select: vi.fn(() => ({ from })),
        } as unknown as Db,
        likePattern,
      );
      await expect(service.searchByNamePrefix('4', 25)).resolves.toEqual(rows);
      expect(limit).toHaveBeenCalledWith(25);
    });
  });

  describe('findById', () => {
    function makeFindByIdBuilder(rows: unknown[]) {
      const builder: Record<string, unknown> = {};
      builder.from = vi.fn(() => builder);
      builder.innerJoin = vi.fn(() => builder);
      builder.where = vi.fn(() => Promise.resolve(rows));
      return builder;
    }

    it('returns the team with its race and coach names and ids', async () => {
      const row = {
        id: 7,
        name: '40 grinders',
        raceName: 'Dwarf',
        raceId: 4,
        coachName: 'Roze Madder',
        coachId: 12,
      };
      const builder = makeFindByIdBuilder([row]);
      const select = vi.fn(() => builder);
      const service = new TeamsService(
        { select } as unknown as Db,
        likePattern,
      );
      await expect(service.findById(7)).resolves.toEqual(row);
      expect(extractFilterValues(firstCallArg(builder.where))).toBe(7);
      const selectArg = (select as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as Record<string, unknown>;
      expect(Object.keys(selectArg)).toEqual(
        expect.arrayContaining(['raceId', 'coachId']),
      );
    });

    it('returns undefined when no team matches', async () => {
      const builder = makeFindByIdBuilder([]);
      const service = new TeamsService(
        {
          select: vi.fn(() => builder),
        } as unknown as Db,
        likePattern,
      );
      await expect(service.findById(999)).resolves.toBeUndefined();
      expect(extractFilterValues(firstCallArg(builder.where))).toBe(999);
    });
  });

  describe('getCareerSpan', () => {
    function makeSpanBuilder(rows: unknown[]) {
      const builder: Record<string, unknown> = {};
      builder.from = vi.fn(() => builder);
      builder.innerJoin = vi.fn(() => builder);
      builder.where = vi.fn(() => Promise.resolve(rows));
      return builder;
    }

    it('returns the min/max match dates for the team', async () => {
      const builder = makeSpanBuilder([
        { start: '2021-09-01', end: '2023-06-10' },
      ]);
      const service = new TeamsService(
        {
          select: vi.fn(() => builder),
        } as unknown as Db,
        likePattern,
      );
      await expect(service.getCareerSpan(7)).resolves.toEqual({
        start: '2021-09-01',
        end: '2023-06-10',
      });
      expect(extractFilterValues(firstCallArg(builder.where))).toBe(7);
    });

    it('returns undefined when the team has played no matches', async () => {
      const builder = makeSpanBuilder([{ start: null, end: null }]);
      const service = new TeamsService(
        {
          select: vi.fn(() => builder),
        } as unknown as Db,
        likePattern,
      );
      await expect(service.getCareerSpan(7)).resolves.toBeUndefined();
    });
  });

  describe('getTopPlayersByMatchEventCount', () => {
    function makeTopPlayersBuilder(rows: unknown[]) {
      const builder: Record<string, unknown> = {};
      builder.from = vi.fn(() => builder);
      builder.innerJoin = vi.fn(() => builder);
      builder.where = vi.fn(() => builder);
      builder.groupBy = vi.fn(() => builder);
      builder.orderBy = vi.fn(() => builder);
      builder.limit = vi.fn(() => Promise.resolve(rows));
      return builder;
    }

    it('returns players ranked by total match events, capped to the limit', async () => {
      const rows = [
        { playerId: 1, name: 'Griff', count: 20 },
        { playerId: 2, name: 'Morg', count: 11 },
      ];
      const builder = makeTopPlayersBuilder(rows);
      const service = new TeamsService(
        {
          select: vi.fn(() => builder),
        } as unknown as Db,
        likePattern,
      );
      await expect(
        service.getTopPlayersByMatchEventCount(7, 10),
      ).resolves.toEqual(rows);
      expect(extractFilterValues(firstCallArg(builder.where))).toBe(7);
      expect(builder.limit).toHaveBeenCalledWith(10);
    });

    it('sums events of different types into one total per player', async () => {
      // The query GROUP BYs the player and COUNTs every matched row regardless
      // of action type, so a player with touchdowns + casualties + fouls
      // surfaces as a single summed count. The mock returns the already-summed
      // shape the SQL would produce; this pins the pass-through and limit.
      const rows = [{ playerId: 1, name: 'Griff', count: 37 }];
      const builder = makeTopPlayersBuilder(rows);
      const service = new TeamsService(
        {
          select: vi.fn(() => builder),
        } as unknown as Db,
        likePattern,
      );
      await expect(
        service.getTopPlayersByMatchEventCount(7, 10),
      ).resolves.toEqual(rows);
      expect(builder.limit).toHaveBeenCalledWith(10);
    });
  });
});
