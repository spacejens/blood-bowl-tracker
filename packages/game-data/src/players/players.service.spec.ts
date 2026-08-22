import type { Db } from '@blood-bowl-tracker/db';
import { DB, players } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { QueryChain } from '../shared/db-mock.test-helpers';
import { mockDb } from '../shared/db-mock.test-helpers';
import { LikePatternService } from '../shared/like-pattern.service';
import {
  extractAllFilterValues,
  extractFilterValues,
  extractJoinColumns,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import { SppTotalsService } from '../spp/spp-totals.service';
import type { PlayerDeepdiveCategoryCounts } from './player-deepdive-counts.service';
import { PlayerDeepdiveCountsService } from './player-deepdive-counts.service';
import { PlayersService, PlayerUpsertConflictError } from './players.service';

const fakePlayer = {
  id: 1,
  name: 'Griff Oberwald',
  teamEraId: 10,
  positionId: 20,
  createdAt: new Date('2026-01-01'),
};

describe('PlayersService', () => {
  let service: PlayersService;
  let likePattern: MockProxy<LikePatternService>;
  let deepdiveCounts: MockProxy<PlayerDeepdiveCountsService>;

  async function build(...rowsPerQuery: unknown[][]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [
        PlayersService,
        { provide: LikePatternService, useValue: likePattern },
        { provide: SppTotalsService, useValue: mock<SppTotalsService>() },
        { provide: PlayerDeepdiveCountsService, useValue: deepdiveCounts },
        { provide: DB, useValue: db },
      ],
    }).compile();
    service = moduleRef.get(PlayersService);
    return { db, chains };
  }

  beforeEach(() => {
    likePattern = mock<LikePatternService>();
    deepdiveCounts = mock<PlayerDeepdiveCountsService>();
  });

  describe('upsert', () => {
    const base = { name: 'Griff Oberwald', teamEraId: 10, positionId: 20 };
    const externalIds = [
      { externalSystemId: 1, externalId: '12345' },
      { externalSystemId: 2, externalId: 'Griff Oberwald' },
    ];

    it('creates a new player when no external IDs match', async () => {
      // query 0: external-id lookup finds nothing; query 1: the insert
      // returns the row; query 2: both external IDs are new, so they get
      // inserted.
      const { db, chains } = await build([], [fakePlayer]);

      const result = await service.upsert({ ...base, externalIds });

      expect(result).toEqual({ player: fakePlayer, created: true });
      expect(chains).toHaveLength(3);
      expect(db.insert).toHaveBeenCalledWith(players);
      expect(db.update).not.toHaveBeenCalled();
    });

    it('updates the matching player when exactly one external ID matches', async () => {
      // query 0: external-id lookup finds one owner; query 1: the update
      // returns the row; query 2: the one still-missing external ID gets
      // inserted.
      const { db, chains } = await build(
        [{ ownerId: 1, externalSystemId: 1, externalId: '12345' }],
        [fakePlayer],
      );

      const result = await service.upsert({ ...base, externalIds });

      expect(result).toEqual({ player: fakePlayer, created: false });
      expect(chains).toHaveLength(3);
      expect(db.update).toHaveBeenCalledWith(players);
    });

    it('throws PlayerUpsertConflictError when external IDs match different players', async () => {
      const { db, chains } = await build([
        { ownerId: 1, externalSystemId: 1, externalId: '12345' },
        { ownerId: 2, externalSystemId: 2, externalId: 'Griff Oberwald' },
      ]);

      await expect(service.upsert({ ...base, externalIds })).rejects.toThrow(
        PlayerUpsertConflictError,
      );
      expect(chains).toHaveLength(1);
      expect(db.insert).not.toHaveBeenCalled();
      expect(db.update).not.toHaveBeenCalled();
    });

    it('does not re-insert external IDs that already exist on the matched player', async () => {
      // Both external IDs already resolve to the same owner, so no join-table
      // insert is issued: only the lookup and the update run.
      const { db, chains } = await build(
        [
          { ownerId: 1, externalSystemId: 1, externalId: '12345' },
          { ownerId: 1, externalSystemId: 2, externalId: 'Griff Oberwald' },
        ],
        [fakePlayer],
      );

      await service.upsert({ ...base, externalIds });

      expect(chains).toHaveLength(2);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('inserts only the external IDs that are new for an existing player', async () => {
      const { chains } = await build(
        [{ ownerId: 1, externalSystemId: 1, externalId: '12345' }],
        [fakePlayer],
      );

      await service.upsert({ ...base, externalIds });

      expect(chains).toHaveLength(3);
      expect(firstCallArg(chains[2].values)).toEqual([
        { playerId: 1, externalSystemId: 2, externalId: 'Griff Oberwald' },
      ]);
    });

    it('updates only the supplied column, leaving teamEraId and positionId alone', async () => {
      const { chains } = await build(
        [{ ownerId: 1, externalSystemId: 1, externalId: '12345' }],
        [fakePlayer],
      );

      await service.upsert({
        name: 'Griff Oberwald II',
        externalIds: [{ externalSystemId: 1, externalId: '12345' }],
      });

      expect(firstCallArg(chains[1].set)).toEqual({
        name: 'Griff Oberwald II',
      });
    });

    it('writes sppTotal through to the entity columns', async () => {
      const { chains } = await build([], [fakePlayer]);

      await service.upsert({ ...base, sppTotal: 176, externalIds });

      // chains[1] is the insert; its .values() carries the entity columns.
      expect(firstCallArg(chains[1].values)).toMatchObject({ sppTotal: 176 });
    });

    it('leaves sppTotal undefined in the columns when the caller omits it', async () => {
      const { chains } = await build([], [fakePlayer]);

      await service.upsert({ ...base, externalIds });

      expect(
        (firstCallArg(chains[1].values) as { sppTotal?: number }).sppTotal,
      ).toBeUndefined();
    });
  });

  describe('findById', () => {
    it('returns the joined player detail row', async () => {
      const row = {
        id: 1,
        name: 'Griff Oberwald',
        teamName: 'Reikland Reavers',
        teamId: 11,
        raceName: 'Human',
        raceId: 4,
        positionName: 'Blitzer',
        eraName: 'Season 5',
        eraId: 7,
        sppTotal: 24,
        sppAdjustment: 2,
      };
      const { db, chains } = await build([row]);
      await expect(service.findById(1)).resolves.toEqual(row);
      expect(chains[0].innerJoin).toHaveBeenCalledTimes(5);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(1);
      const selectArg = firstCallArg(db.select, 0, 0) as Record<
        string,
        unknown
      >;
      expect(Object.keys(selectArg)).toEqual(
        expect.arrayContaining([
          'teamId',
          'raceId',
          'eraName',
          'eraId',
          'sppTotal',
          'sppAdjustment',
        ]),
      );
    });

    it('passes through null spp columns for a player with no computed total', async () => {
      // null means "not yet computed" for either column; the deepdive
      // distinguishes it from a computed 0, so findById must not coerce it.
      const row = {
        id: 2,
        name: 'Nobody Special',
        teamName: 'Reikland Reavers',
        teamId: 11,
        raceName: 'Human',
        raceId: 4,
        positionName: 'Lineman',
        eraName: 'Season 5',
        eraId: 7,
        sppTotal: null,
        sppAdjustment: null,
      };
      await build([row]);
      await expect(service.findById(2)).resolves.toEqual(row);
    });

    it('joins the era through the player team-era', async () => {
      // Every player has exactly one team-era and therefore exactly one era,
      // so this is an inner join like the others; asserting the joined columns
      // (rather than only the join count) pins it to team_eras.era_id -> eras.id
      // instead of any other pair of columns that would also raise the count.
      const { chains } = await build([]);
      await service.findById(1);
      const joinConditions = chains[0].innerJoin.mock.calls.map(
        (call: unknown[]) => call[1],
      );
      const joinedColumnSets = joinConditions.map((condition) =>
        extractJoinColumns(condition),
      );
      expect(joinedColumnSets).toContainEqual(
        expect.arrayContaining(['eras.id', 'team_eras.era_id']),
      );
    });

    it('returns undefined when no player matches', async () => {
      await build([]);
      await expect(service.findById(999)).resolves.toBeUndefined();
    });
  });

  describe('searchByNamePrefix', () => {
    it('returns id, name, and team for name-prefix matches', async () => {
      const rows = [
        { id: 1, name: 'Griff Oberwald', teamName: 'Reikland Reavers' },
      ];
      likePattern.escape.mockReturnValue('Gri');
      const { chains } = await build(rows);
      await expect(service.searchByNamePrefix('Gri', 25)).resolves.toEqual(
        rows,
      );
      expect(chains[0].innerJoin).toHaveBeenCalledTimes(3);
      expect(chains[0].limit).toHaveBeenCalledWith(25);
    });

    it('excludes star players from the results', async () => {
      likePattern.escape.mockReturnValue('Mor');
      const { chains } = await build([]);

      await service.searchByNamePrefix('Mor', 25);

      // players -> teamEras -> teams -> positions
      expect(chains[0].innerJoin).toHaveBeenCalledTimes(3);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 2, 1)),
      ).toEqual(['positions.id', 'players.position_id']);
      // isStarPlayer=false is the only filter value extractAllFilterValues can see
      // here; ilike()'s pattern argument isn't wrapped in a drizzle Param, so it's
      // invisible to this helper (see the innerJoin/join-column assertions above
      // for the positions join, which independently confirm the star filter is
      // wired).
      const filterValues = extractAllFilterValues(
        firstCallArg(chains[0].where),
      );
      expect(filterValues).toContain(false);
    });
  });

  describe('getDeepdiveCategoryCounts', () => {
    // The actual query shapes and counting logic live in
    // PlayerDeepdiveCountsService's own spec
    // (player-deepdive-counts.service.spec.ts); this only proves the
    // delegation wiring.
    it('delegates to PlayerDeepdiveCountsService', async () => {
      const counts: PlayerDeepdiveCategoryCounts = {
        simple: [{ label: 'MVP awards', count: 2 }],
        casualties: { total: 1, seriousInjuries: 0, killed: 0 },
        fouls: { total: 0, seriousInjuries: 0, killed: 0 },
      };
      deepdiveCounts.getDeepdiveCategoryCounts.mockResolvedValue(counts);
      await build();

      await expect(service.getDeepdiveCategoryCounts(1)).resolves.toBe(counts);
      expect(deepdiveCounts.getDeepdiveCategoryCounts).toHaveBeenCalledWith(1);
    });
  });

  describe('getContextNamesByIds', () => {
    it('returns the context names the query resolves to, keyed by player id', async () => {
      const { db } = await build([
        {
          playerId: 1,
          positionName: 'Blitzer',
          teamName: 'Reikland Reavers',
          raceName: 'Human',
          eraName: 'First era',
          coachName: 'Roze Madder',
        },
      ]);
      const names = await service.getContextNamesByIds([1]);
      expect(names.get(1)).toEqual({
        positionName: 'Blitzer',
        teamName: 'Reikland Reavers',
        raceName: 'Human',
        eraName: 'First era',
        coachName: 'Roze Madder',
      });
      expect(db.select).toHaveBeenCalledTimes(1);
    });

    it('returns an empty map without querying when given no ids', async () => {
      const { db } = await build([]);
      const names = await service.getContextNamesByIds([]);
      expect(names.size).toBe(0);
      expect(db.select).not.toHaveBeenCalled();
    });
  });

  describe('countAll', () => {
    it('returns the total row count', async () => {
      const { db } = await build([{ count: 5 }]);
      await expect(service.countAll()).resolves.toBe(5);
      expect(db.select).toHaveBeenCalledTimes(1);
    });
  });

  describe('countByEra', () => {
    it('returns the player count for the era', async () => {
      const { db, chains } = await build([{ count: 88 }]);
      await expect(service.countByEra(5)).resolves.toBe(88);
      expect(db.select).toHaveBeenCalledTimes(1);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['team_eras.id', 'players.team_era_id']);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(5);
    });
  });

  describe('countByLeague', () => {
    it('returns the player count for the league', async () => {
      const { db, chains } = await build([{ count: 130 }]);
      await expect(service.countByLeague(9)).resolves.toBe(130);
      expect(db.select).toHaveBeenCalledTimes(1);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['team_eras.id', 'players.team_era_id']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 1, 1)),
      ).toEqual(['eras.id', 'team_eras.era_id']);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(9);
    });
  });

  describe('countByCompetition', () => {
    it('returns the player count for the competition', async () => {
      const { db, chains } = await build([{ count: 42 }]);
      await expect(service.countByCompetition(7)).resolves.toBe(42);
      expect(db.select).toHaveBeenCalledTimes(1);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['competition_teams.team_era_id', 'players.team_era_id']);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(7);
    });
  });
});
