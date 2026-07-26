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
  CASUALTY_CAUSED_TYPES,
  COMPLETION_TYPES,
  DEATH_CAUSED_TYPES,
  DEFLECTION_TYPES,
  FOUL_TYPES,
  INTERCEPTION_TYPES,
  MVP_AWARD_TYPES,
  SERIOUS_INJURY_CAUSED_TYPES,
  TOUCHDOWN_TYPES,
} from '../shared/match-event-types';
import {
  extractAllFilterValues,
  extractFilterValues,
  extractJoinColumns,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
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

  async function build(...rowsPerQuery: unknown[][]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [
        PlayersService,
        { provide: LikePatternService, useValue: likePattern },
        { provide: DB, useValue: db },
      ],
    }).compile();
    service = moduleRef.get(PlayersService);
    return { db, chains };
  }

  beforeEach(() => {
    likePattern = mock<LikePatternService>();
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
      };
      const { db, chains } = await build([row]);
      await expect(service.findById(1)).resolves.toEqual(row);
      expect(chains[0].innerJoin).toHaveBeenCalledTimes(4);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(1);
      const selectArg = firstCallArg(db.select, 0, 0) as Record<
        string,
        unknown
      >;
      expect(Object.keys(selectArg)).toEqual(
        expect.arrayContaining(['teamId', 'raceId']),
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
      expect(chains[0].innerJoin).toHaveBeenCalledTimes(2);
      expect(chains[0].limit).toHaveBeenCalledWith(25);
    });
  });

  describe('getDeepdiveCategoryCounts', () => {
    const expectedLabels = [
      'MVP awards',
      'Touchdowns scored',
      'Completions',
      'Interceptions',
      'Deflections',
      'Casualties inflicted',
      'Serious injuries inflicted',
      'Opponents killed',
      'Fouls committed',
    ];

    it('returns all nine categories in fixed order with their counts', async () => {
      const counts = [2, 5, 3, 1, 4, 6, 0, 0, 7];
      const { db } = await build(...counts.map((n) => [{ count: n }]));
      await expect(service.getDeepdiveCategoryCounts(1)).resolves.toEqual(
        expectedLabels.map((label, i) => ({ label, count: counts[i] })),
      );
      expect(db.select).toHaveBeenCalledTimes(9);
    });

    it('returns every category as zero for a player with no events', async () => {
      await build(...Array.from({ length: 9 }, () => [{ count: 0 }]));
      await expect(service.getDeepdiveCategoryCounts(1)).resolves.toEqual(
        expectedLabels.map((label) => ({ label, count: 0 })),
      );
    });

    it('binds each category label to its own type-set selector, in order', async () => {
      // Mirrors the fixed label -> *_TYPES mapping from the deepdive plan; a
      // transposition of two entries here would leave the two tests above
      // green (they only check labels and counts), so this test inspects the
      // actual `inArray(matchEvents.actionType, ...)` values each call built.
      const expectedTypeSets: readonly (readonly string[])[] = [
        MVP_AWARD_TYPES,
        TOUCHDOWN_TYPES,
        COMPLETION_TYPES,
        INTERCEPTION_TYPES,
        DEFLECTION_TYPES,
        CASUALTY_CAUSED_TYPES,
        SERIOUS_INJURY_CAUSED_TYPES,
        DEATH_CAUSED_TYPES,
        FOUL_TYPES,
      ];
      const { chains } = await build(
        ...expectedTypeSets.map(() => [{ count: 0 }]),
      );

      await service.getDeepdiveCategoryCounts(1);

      chains.forEach((chain, index) => {
        const values = extractAllFilterValues(firstCallArg(chain.where));
        // The where clause is `and(inArray(actionType, types), eq(players.id,
        // playerId))`; the trailing value is the playerId param, so the
        // type-set values are everything before it.
        expect(values.slice(0, -1)).toEqual([...expectedTypeSets[index]]);
      });
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
