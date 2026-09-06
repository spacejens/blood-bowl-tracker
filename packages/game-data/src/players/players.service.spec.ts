import { DB, players } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { CharacteristicFormatMismatchError } from '../shared/characteristic-format-mismatch-error';
import { CharacteristicFormatValidationService } from '../shared/characteristic-format-validation.service';
import { LikePatternService } from '../shared/like-pattern.service';
import { MatchEventCountsService } from '../shared/match-event-counts.service';
import { PlayerContextNamesService } from '../shared/player-context-names.service';
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
  move: 6,
  strength: 3,
  agility: 3,
  passing: 4,
  armour: 9,
  createdAt: new Date('2026-01-01'),
};

describe('PlayersService', () => {
  let service: PlayersService;
  let likePattern: MockProxy<LikePatternService>;
  let deepdiveCounts: MockProxy<PlayerDeepdiveCountsService>;
  let matchEventCounts: MockProxy<MatchEventCountsService>;
  let playerContextNames: MockProxy<PlayerContextNamesService>;

  async function build(...rowsPerQuery: unknown[][]): Promise<MockDbResult> {
    const dbMock = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [
        PlayersService,
        { provide: LikePatternService, useValue: likePattern },
        { provide: SppTotalsService, useValue: mock<SppTotalsService>() },
        { provide: PlayerDeepdiveCountsService, useValue: deepdiveCounts },
        { provide: MatchEventCountsService, useValue: matchEventCounts },
        { provide: PlayerContextNamesService, useValue: playerContextNames },
        CharacteristicFormatValidationService,
        { provide: DB, useValue: dbMock.db },
      ],
    }).compile();
    service = moduleRef.get(PlayersService);
    return dbMock;
  }

  beforeEach(() => {
    likePattern = mock<LikePatternService>();
    deepdiveCounts = mock<PlayerDeepdiveCountsService>();
    matchEventCounts = mock<MatchEventCountsService>();
    playerContextNames = mock<PlayerContextNamesService>();
  });

  describe('upsert', () => {
    const base = { name: 'Griff Oberwald', teamEraId: 10, positionId: 20 };
    const externalIds = [
      { externalSystemId: 1, externalId: '12345' },
      { externalSystemId: 2, externalId: 'Griff Oberwald' },
    ];
    const bb2020Formats = {
      moveFormat: 'bare',
      strengthFormat: 'bare',
      agilityFormat: 'plus',
      passingFormat: 'plus',
      armourFormat: 'plus',
    };
    const crpFormats = {
      moveFormat: 'bare',
      strengthFormat: 'bare',
      agilityFormat: 'bare',
      passingFormat: 'absent',
      armourFormat: 'bare',
    };
    const characteristics = {
      move: 6,
      strength: 3,
      agility: 3,
      passing: 4,
      armour: 9,
    };

    it('creates a new player when no external IDs match', async () => {
      // query 0: rules-set format lookup; query 1: external-id lookup finds
      // nothing; query 2: the insert returns the row; query 3: both external
      // IDs are new, so they get inserted.
      const { db, chains } = await build([bb2020Formats], [], [fakePlayer]);

      const result = await service.upsert({
        ...base,
        ...characteristics,
        rulesSetId: 4,
        externalIds,
      });

      expect(result).toEqual({ player: fakePlayer, created: true });
      expect(chains).toHaveLength(4);
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
      const { chains } = await build([bb2020Formats], [], [fakePlayer]);

      await service.upsert({
        ...base,
        ...characteristics,
        rulesSetId: 4,
        sppTotal: 176,
        externalIds,
      });

      // chains[2] is the insert; its .values() carries the entity columns.
      expect(firstCallArg(chains[2].values)).toMatchObject({ sppTotal: 176 });
    });

    it('leaves sppTotal undefined in the columns when the caller omits it', async () => {
      const { chains } = await build([bb2020Formats], [], [fakePlayer]);

      await service.upsert({
        ...base,
        ...characteristics,
        rulesSetId: 4,
        externalIds,
      });

      expect(
        (firstCallArg(chains[2].values) as { sppTotal?: number }).sppTotal,
      ).toBeUndefined();
    });

    it('writes the five characteristics when they match the rules set', async () => {
      // Query 0: the rules-set format lookup. Query 1: the external-id
      // lookup finds nothing. Query 2: the insert. Query 3: external ids.
      const { chains } = await build([bb2020Formats], [], [fakePlayer]);

      await service.upsert({
        ...base,
        ...characteristics,
        rulesSetId: 4,
        externalIds,
      });

      expect(firstCallArg(chains[2].values)).toMatchObject(characteristics);
    });

    it('writes a null passing for a rules set that has no Passing', async () => {
      const { chains } = await build([crpFormats], [], [fakePlayer]);

      await service.upsert({
        ...base,
        ...characteristics,
        passing: null,
        armour: 8,
        rulesSetId: 5,
        externalIds,
      });

      expect(firstCallArg(chains[2].values)).toMatchObject({ passing: null });
    });

    it('leaves the characteristic columns untouched when the caller omits them', async () => {
      // No format lookup at all: query 0 is the external-id lookup (which
      // finds the existing owner), query 1 is the update, and query 2 is the
      // insert of the one still-missing external ID.
      const { chains } = await build(
        [{ ownerId: 1, externalSystemId: 1, externalId: '12345' }],
        [fakePlayer],
      );

      await service.upsert({ ...base, externalIds });

      expect(chains).toHaveLength(3);
      const values = firstCallArg(chains[1].set) as Record<string, unknown>;
      expect(values.move).toBeUndefined();
      expect(values.passing).toBeUndefined();
    });

    it('throws when creating a new player without characteristics', async () => {
      const { chains } = await build([], [fakePlayer]);

      await expect(service.upsert({ ...base, externalIds })).rejects.toThrow(
        'Cannot create new players: missing required field(s): move, strength, agility, armour',
      );
      expect(chains).toHaveLength(1);
    });

    it('rejects a Passing value the rules set declares absent, writing nothing', async () => {
      const { transaction, chains } = await build([crpFormats]);

      await expect(
        service.upsert({
          ...base,
          ...characteristics,
          rulesSetId: 5,
          externalIds,
        }),
      ).rejects.toBeInstanceOf(CharacteristicFormatMismatchError);
      expect(chains).toHaveLength(1);
      expect(transaction).not.toHaveBeenCalled();
    });

    it('rejects a missing characteristic the rules set requires, writing nothing', async () => {
      const { transaction, chains } = await build([bb2020Formats]);

      await expect(
        service.upsert({
          ...base,
          ...characteristics,
          passing: null,
          rulesSetId: 4,
          externalIds,
        }),
      ).rejects.toBeInstanceOf(CharacteristicFormatMismatchError);
      expect(chains).toHaveLength(1);
      expect(transaction).not.toHaveBeenCalled();
    });

    it('rejects an unknown rulesSetId, writing nothing', async () => {
      const { transaction, chains } = await build([]);

      await expect(
        service.upsert({
          ...base,
          ...characteristics,
          rulesSetId: 99,
          externalIds,
        }),
      ).rejects.toBeInstanceOf(CharacteristicFormatMismatchError);
      expect(chains).toHaveLength(1);
      expect(transaction).not.toHaveBeenCalled();
    });

    it('names the offending player in the rejection', async () => {
      await build([crpFormats]);

      await expect(
        service.upsert({
          ...base,
          ...characteristics,
          rulesSetId: 5,
          externalIds,
        }),
      ).rejects.toThrow(/player 1:12345/);
    });

    it('rejects a rulesSetId supplied without a complete characteristic line', async () => {
      const { transaction } = await build();

      await expect(
        service.upsert({ ...base, rulesSetId: 4, externalIds }),
      ).rejects.toThrow(/without a complete set of characteristics/);
      expect(transaction).not.toHaveBeenCalled();
    });

    it('rejects characteristics supplied without a rulesSetId', async () => {
      const { transaction } = await build();

      await expect(
        service.upsert({ ...base, ...characteristics, externalIds }),
      ).rejects.toThrow(/without a rules set to validate/);
      expect(transaction).not.toHaveBeenCalled();
    });

    it('rejects a partial characteristic line supplied without a rulesSetId', async () => {
      const { transaction } = await build();

      await expect(
        service.upsert({ ...base, move: 6, externalIds }),
      ).rejects.toThrow(/all-or-nothing/);
      expect(transaction).not.toHaveBeenCalled();
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
        positionId: 3,
        eraName: 'Season 5',
        eraId: 7,
        sppTotal: 24,
        sppAdjustment: 2,
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
          'move',
          'strength',
          'agility',
          'passing',
          'armour',
        ]),
      );
    });

    it('passes through a legacy zero and a null passing untouched', async () => {
      // A stored 0 is a stale legacy value (0 is not a legal value for these
      // columns under any rules set), and `null` passing is a rules set with
      // no Passing characteristic; the deepdive renders both as a dash, so
      // findById must not coerce either.
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
    it('delegates to PlayerContextNamesService', async () => {
      const names = new Map([
        [
          1,
          {
            positionName: 'Blitzer',
            teamName: 'Reikland Reavers',
            raceName: 'Human',
            eraName: 'First era',
            coachName: 'Roze Madder',
          },
        ],
      ]);
      playerContextNames.getPlayerContextNamesByIds.mockResolvedValue(names);
      await build();

      await expect(service.getContextNamesByIds([1])).resolves.toBe(names);

      expect(
        playerContextNames.getPlayerContextNamesByIds,
      ).toHaveBeenCalledWith([1]);
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
