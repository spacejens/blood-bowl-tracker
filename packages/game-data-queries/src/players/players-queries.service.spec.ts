import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import {
  extractAllFilterValues,
  extractFilterValues,
  extractJoinColumns,
  firstCallArg,
  mockDb,
} from '@blood-bowl-tracker/db/test-helpers';
import type { PlayerStatus } from '@blood-bowl-tracker/domain-enums';
import { SppTotalsService } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { LikePatternService } from '../shared/like-pattern.service';
import { MatchEventCountsService } from '../shared/match-event-counts.service';
import { PlayersQueriesService } from './players-queries.service';

const fakePlayer = {
  id: 1,
  name: 'Griff Oberwald',
  teamEraId: 10,
  positionId: 20,
  move: 6,
  strength: 3,
  agility: 3,
  passing: 4,
  armour: 9,
  missNextGame: false,
  nigglingInjuryCount: 0,
  moveReductionCount: 0,
  strengthReductionCount: 0,
  agilityReductionCount: 0,
  passingReductionCount: 0,
  armourReductionCount: 0,
  createdAt: new Date('2026-01-01'),
};

describe('PlayersQueriesService', () => {
  let service: PlayersQueriesService;
  let likePattern: MockProxy<LikePatternService>;

  async function build(...rowsPerQuery: unknown[][]): Promise<MockDbResult> {
    const dbMock = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [
        PlayersQueriesService,
        { provide: LikePatternService, useValue: likePattern },
        {
          provide: MatchEventCountsService,
          useValue: mock<MatchEventCountsService>(),
        },
        { provide: SppTotalsService, useValue: mock<SppTotalsService>() },
        { provide: DB, useValue: dbMock.db },
      ],
    }).compile();
    service = moduleRef.get(PlayersQueriesService);
    return dbMock;
  }

  beforeEach(() => {
    likePattern = mock<LikePatternService>();
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
        positionId: 3,
        eraName: 'Season 5',
        eraId: 7,
        eraStartDate: '2020-01-01',
        eraEndDate: null as string | null,
        sppTotal: 24,
        sppAdjustment: 2,
        status: 'active' as PlayerStatus | null,
        move: 7,
        strength: 3,
        agility: 3,
        passing: 4,
        armour: 9,
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
          'status',
          'move',
          'strength',
          'agility',
          'passing',
          'armour',
        ]),
      );
    });

    it("selects the era's own date range alongside its name", async () => {
      const { db } = await build([]);

      await service.findById(1);

      const selectArg = firstCallArg(db.select, 0, 0) as Record<
        string,
        unknown
      >;
      expect(Object.keys(selectArg)).toEqual(
        expect.arrayContaining(['eraName', 'eraStartDate', 'eraEndDate']),
      );
    });

    it('passes through a placeholder zero and a null passing untouched', async () => {
      // A stored 0 is the not-yet-curated placeholder and `null` passing is a
      // rules set with no Passing characteristic; the deepdive renders both as
      // a dash, so findById must not coerce either.
      const row = {
        id: 3,
        name: 'Uncurated Lineman',
        teamName: 'Reikland Reavers',
        teamId: 11,
        raceName: 'Human',
        raceId: 4,
        positionName: 'Lineman',
        positionId: 8,
        eraName: 'Season 5',
        eraId: 7,
        sppTotal: 0,
        sppAdjustment: 0,
        move: 0,
        strength: 0,
        agility: 0,
        passing: null,
        armour: 0,
      };
      await build([row]);
      await expect(service.findById(3)).resolves.toEqual(row);
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
        positionId: 8,
        eraName: 'Season 5',
        eraId: 7,
        sppTotal: null,
        sppAdjustment: null,
        move: 6,
        strength: 3,
        agility: 3,
        passing: null,
        armour: 8,
      };
      await build([row]);
      await expect(service.findById(2)).resolves.toEqual(row);
    });

    it('resolves the position id alongside the position name', async () => {
      await build([
        {
          id: 1,
          name: 'Griff',
          teamName: 'Reikland Reavers',
          teamId: 2,
          raceName: 'Human',
          raceId: 3,
          positionName: 'Blitzer',
          positionId: 4,
          eraName: 'BB2020',
          eraId: 5,
          sppTotal: 130,
          sppAdjustment: 0,
          move: 7,
          strength: 3,
          agility: 3,
          passing: 4,
          armour: 9,
        },
      ]);

      await expect(service.findById(1)).resolves.toMatchObject({
        positionId: 4,
        positionName: 'Blitzer',
      });
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

    it('selects the seven lasting-injury columns', async () => {
      const { db } = await build([fakePlayer]);

      await service.findById(1);

      expect(Object.keys(firstCallArg(db.select, 0, 0) as object)).toEqual(
        expect.arrayContaining([
          'missNextGame',
          'nigglingInjuryCount',
          'moveReductionCount',
          'strengthReductionCount',
          'agilityReductionCount',
          'passingReductionCount',
          'armourReductionCount',
        ]),
      );
    });

    it('passes a null status through as unknown, not active', async () => {
      // NULL means no source has reported a status; findById must not coerce
      // it to 'active'.
      await build([{ ...fakePlayer, status: null }]);

      await expect(service.findById(1)).resolves.toMatchObject({
        status: null,
      });
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
