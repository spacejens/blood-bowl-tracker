import type { Db } from '@blood-bowl-tracker/db';
import { describe, expect, it, vi } from 'vitest';

import {
  extractFilterValues,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import { TeamsService } from './teams.service';

describe('TeamsService lookups', () => {
  describe('searchByNamePrefix', () => {
    it('returns id/name choices for a name prefix, capped to the limit', async () => {
      const rows = [
        { id: 1, name: '40 grinders' },
        { id: 2, name: '4th Down Doom' },
      ];
      const limit = vi.fn().mockResolvedValue(rows);
      const where = vi.fn(() => ({ limit }));
      const from = vi.fn(() => ({ where }));
      const service = new TeamsService({
        select: vi.fn(() => ({ from })),
      } as unknown as Db);
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

    it('returns the team with its race and coach names', async () => {
      const builder = makeFindByIdBuilder([
        {
          id: 7,
          name: '40 grinders',
          raceName: 'Dwarf',
          coachName: 'Roze Madder',
        },
      ]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await expect(service.findById(7)).resolves.toEqual({
        id: 7,
        name: '40 grinders',
        raceName: 'Dwarf',
        coachName: 'Roze Madder',
      });
      expect(extractFilterValues(firstCallArg(builder.where))).toBe(7);
    });

    it('returns undefined when no team matches', async () => {
      const builder = makeFindByIdBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await expect(service.findById(999)).resolves.toBeUndefined();
      expect(extractFilterValues(firstCallArg(builder.where))).toBe(999);
    });
  });
});
