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
  extractAllFilterValues,
  extractJoinColumns,
  firstCallArg,
  sqlText,
} from '../shared/query-assertions.test-helpers';
import { StarPlayersService } from './star-players.service';

describe('StarPlayersService', () => {
  let service: StarPlayersService;
  let likePattern: MockProxy<LikePatternService>;

  async function build(...rowsPerQuery: unknown[][]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [
        StarPlayersService,
        { provide: LikePatternService, useValue: likePattern },
        { provide: DB, useValue: db },
      ],
    }).compile();
    service = moduleRef.get(StarPlayersService);
    return { db, chains };
  }

  beforeEach(() => {
    likePattern = mock<LikePatternService>();
    likePattern.escape.mockImplementation((value) => value);
  });

  describe('findById', () => {
    it('returns the star identity for a star position', async () => {
      await build([{ positionId: 20, name: 'Griff Oberwald' }]);

      const result = await service.findById(20);

      expect(result).toEqual({ positionId: 20, name: 'Griff Oberwald' });
    });

    it('filters on the position id and on is_star_player', async () => {
      const { chains } = await build([{ positionId: 20, name: 'Griff' }]);

      await service.findById(20);

      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        20,
        true,
      ]);
    });

    it('returns undefined when the position is not a star position', async () => {
      await build([]);

      expect(await service.findById(20)).toBeUndefined();
    });
  });

  describe('listHiresByTeam', () => {
    it('returns one row per hiring team', async () => {
      const rows = [
        {
          teamId: 1,
          teamName: 'Reikland Reavers',
          raceName: 'Human',
          coachName: 'Rita',
          hireCount: 3,
        },
        {
          teamId: 2,
          teamName: 'Gouged Eye',
          raceName: 'Orc',
          coachName: 'Bob',
          hireCount: 1,
        },
      ];
      await build(rows);

      expect(await service.listHiresByTeam(20)).toEqual(rows);
    });

    it('filters by the star position id', async () => {
      const { chains } = await build([]);

      await service.listHiresByTeam(20);

      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        20,
      ]);
    });

    it('joins players through team eras to teams, races and coaches', async () => {
      const { chains } = await build([]);

      await service.listHiresByTeam(20);

      const joins = chains[0].innerJoin.mock.calls.map((call) =>
        extractJoinColumns(call[1]),
      );
      expect(joins).toEqual([
        ['team_eras.id', 'players.team_era_id'],
        ['teams.id', 'team_eras.team_id'],
        ['races.id', 'teams.race_id'],
        ['coaches.id', 'teams.coach_id'],
      ]);
    });

    it('groups and orders the hire totals in one query', async () => {
      const { chains } = await build([]);

      await service.listHiresByTeam(20);

      expect(chains[0].groupBy).toHaveBeenCalledTimes(1);
      expect(chains[0].orderBy).toHaveBeenCalledTimes(1);
    });

    it('orders by hire count descending, then team name ascending — the deepdive service relies on this order and does not re-sort', async () => {
      const { chains } = await build([]);

      await service.listHiresByTeam(20);

      const hireCountOrder = firstCallArg(chains[0].orderBy, 0, 0);
      expect(extractJoinColumns(hireCountOrder)).toEqual(['players.id']);
      expect(sqlText(hireCountOrder)).toContain('count');
      expect(sqlText(hireCountOrder)).toContain(' desc');

      const teamNameOrder = firstCallArg(chains[0].orderBy, 0, 1);
      expect(extractJoinColumns(teamNameOrder)).toEqual(['teams.name']);
      expect(sqlText(teamNameOrder)).toContain(' asc');
    });
  });

  describe('searchByNamePrefix', () => {
    it('returns one identity per matching star position', async () => {
      await build([{ positionId: 20, name: 'Griff Oberwald' }]);

      expect(await service.searchByNamePrefix('Gri', 25)).toEqual([
        { positionId: 20, name: 'Griff Oberwald' },
      ]);
    });

    it('escapes the prefix and filters on is_star_player', async () => {
      const { chains } = await build([]);

      await service.searchByNamePrefix('100%', 25);

      expect(likePattern.escape).toHaveBeenCalledWith('100%');
      // ilike() embeds its pattern as a raw string chunk rather than a Param,
      // so extractAllFilterValues only picks up the eq() value.
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        true,
      ]);
    });

    it('applies the caller-supplied limit', async () => {
      const { chains } = await build([]);

      await service.searchByNamePrefix('G', 25);

      expect(chains[0].limit).toHaveBeenCalledWith(25);
    });

    it('requires an EXISTS match against players on position id, so a never-hired star is excluded', async () => {
      const { chains } = await build([]);

      await service.searchByNamePrefix('Gri', 25);

      expect(sqlText(firstCallArg(chains[0].where))).toContain('exists');
      // The EXISTS subquery is itself a separate db.select(...) call, issued
      // while building the outer where() argument, so it shows up as its own
      // captured query chain.
      const subquery = chains[1];
      expect(extractJoinColumns(firstCallArg(subquery.where))).toEqual([
        'players.position_id',
        'positions.id',
      ]);
    });

    it('includes a star position that has at least one hire', async () => {
      await build([{ positionId: 20, name: 'Griff Oberwald' }]);

      expect(await service.searchByNamePrefix('Gri', 25)).toEqual([
        { positionId: 20, name: 'Griff Oberwald' },
      ]);
    });
  });

  describe('findByPlayerId', () => {
    it('returns the star identity behind one hire', async () => {
      await build([{ positionId: 20, name: 'Griff Oberwald' }]);

      expect(await service.findByPlayerId(77)).toEqual({
        positionId: 20,
        name: 'Griff Oberwald',
      });
    });

    it('filters on the player id and on is_star_player', async () => {
      const { chains } = await build([]);

      await service.findByPlayerId(77);

      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        77,
        true,
      ]);
    });

    it('returns undefined for a regular (non-star) player', async () => {
      await build([]);

      expect(await service.findByPlayerId(77)).toBeUndefined();
    });
  });
});
