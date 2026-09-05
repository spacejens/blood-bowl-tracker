import type { Db } from '@blood-bowl-tracker/db';
import { DB, positions } from '@blood-bowl-tracker/db';
import type { QueryChain } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { is, SQL, StringChunk } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { FACT_SCOPE_ALL_TIME } from '../shared/fact-scope';
import { LikePatternService } from '../shared/like-pattern.service';
import {
  extractFilterValues,
  extractJoinColumns,
  firstCallArg,
  sqlText,
} from '../shared/query-assertions.test-helpers';
import {
  PositionsService,
  PositionUpsertConflictError,
} from './positions.service';

const fakePosition = {
  id: 1,
  name: 'Lineman',
  isStarPlayer: false,
  createdAt: new Date('2026-01-01'),
};

/**
 * True when a captured aggregate expression is `countDistinct(...)` rather
 * than plain `count(...)`. drizzle-orm renders `countDistinct` as
 * `sql`count(distinct ${expr})`` — its first query chunk is a `StringChunk`
 * whose text starts with "count(distinct ", vs. "count(" for plain `count`.
 * Guards against double-counting: the race-era joins fan a position out to
 * one row per era it is available in.
 */
function isCountDistinct(expr: unknown): boolean {
  if (!is(expr, SQL)) return false;
  const first = expr.queryChunks[0];
  return is(first, StringChunk) && first.value.join('').includes('distinct');
}

describe('PositionsService', () => {
  let service: PositionsService;
  let likePattern: MockProxy<LikePatternService>;

  beforeEach(() => {
    likePattern = mock<LikePatternService>();
  });

  async function build(...rowsPerQuery: unknown[][]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [
        PositionsService,
        { provide: LikePatternService, useValue: likePattern },
        { provide: DB, useValue: db },
      ],
    }).compile();
    service = moduleRef.get(PositionsService);
    return { db, chains };
  }

  const data = {
    name: 'Lineman',
    isStarPlayer: false,
    externalIds: [
      { externalSystemId: 1, externalId: '10-7' },
      { externalSystemId: 2, externalId: 'Orc: Lineman' },
    ],
  };

  it('creates a new position when no external IDs match', async () => {
    // query 0: external-id lookup finds nothing; query 1: the insert returns
    // the row; query 2: both external IDs are new, so they get inserted.
    const { db, chains } = await build([], [fakePosition]);

    const result = await service.upsert(data);

    expect(result).toEqual({
      position: fakePosition,
      created: true,
    });
    expect(chains).toHaveLength(3);
    expect(db.insert).toHaveBeenCalledWith(positions);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('inserts the position with its name and isStarPlayer flag', async () => {
    const { chains } = await build([], [fakePosition]);

    await service.upsert({ ...data, isStarPlayer: true });

    expect(firstCallArg(chains[1].values)).toEqual({
      name: 'Lineman',
      isStarPlayer: true,
    });
  });

  it('updates the matching position when exactly one external ID matches', async () => {
    // query 0: external-id lookup finds one owner; query 1: the semantic
    // conflict check re-reads the existing row; query 2: the update returns
    // the row; query 3: the one still-missing external ID gets inserted.
    const { db, chains } = await build(
      [{ ownerId: 1, externalSystemId: 1, externalId: '10-7' }],
      [fakePosition],
      [fakePosition],
    );

    const result = await service.upsert(data);

    expect(result.created).toBe(false);
    expect(chains).toHaveLength(4);
    expect(db.update).toHaveBeenCalledWith(positions);
  });

  it('throws PositionUpsertConflictError when external IDs match different positions', async () => {
    const { db, chains } = await build([
      { ownerId: 1, externalSystemId: 1, externalId: '10-7' },
      { ownerId: 2, externalSystemId: 2, externalId: 'Orc: Lineman' },
    ]);

    await expect(service.upsert(data)).rejects.toThrow(
      PositionUpsertConflictError,
    );
    expect(chains).toHaveLength(1);
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it('updates only the supplied column, leaving isStarPlayer alone', async () => {
    // query 1 is the semantic-conflict re-read of the existing row; the
    // payload omits isStarPlayer, so the hook never compares it regardless
    // of what this returns.
    const { chains } = await build(
      [{ ownerId: 1, externalSystemId: 1, externalId: '10-7' }],
      [fakePosition],
      [fakePosition],
    );

    await service.upsert({
      name: 'Blitzer',
      externalIds: [
        { externalSystemId: 1, externalId: '10-7' },
        { externalSystemId: 2, externalId: 'Orc: Lineman' },
      ],
    });

    expect(firstCallArg(chains[2].set)).toEqual({ name: 'Blitzer' });
  });

  it('updates only isStarPlayer when it is the sole supplied column, even when false', async () => {
    // false is falsy: this proves the strip logic checks `!== undefined`,
    // not truthiness, so a deliberate false still reaches .set(). The
    // existing row's isStarPlayer must also be false so the semantic
    // conflict check does not reject this as a star/regular mismatch.
    const { chains } = await build(
      [{ ownerId: 1, externalSystemId: 1, externalId: '10-7' }],
      [{ ...fakePosition, isStarPlayer: false }],
      [fakePosition],
    );

    await service.upsert({
      isStarPlayer: false,
      externalIds: [
        { externalSystemId: 1, externalId: '10-7' },
        { externalSystemId: 2, externalId: 'Orc: Lineman' },
      ],
    });

    expect(firstCallArg(chains[2].set)).toEqual({ isStarPlayer: false });
  });

  it('inserts only the external IDs that are new for an existing position', async () => {
    const { chains } = await build(
      [{ ownerId: 1, externalSystemId: 1, externalId: '10-7' }],
      [fakePosition],
      [fakePosition],
    );

    await service.upsert(data);

    expect(firstCallArg(chains[3].values)).toEqual([
      { positionId: 1, externalSystemId: 2, externalId: 'Orc: Lineman' },
    ]);
  });

  it('rejects as a conflict when a star position external id matches an existing regular position', async () => {
    // The external-id lookup matches exactly one owner (not >1), so without
    // the semantic conflict check this would silently flip the existing
    // regular position to a star position. query 1 is the re-read of that
    // existing row, which reports isStarPlayer: false while the incoming
    // payload says true.
    const { db, chains } = await build(
      [{ ownerId: 1, externalSystemId: 1, externalId: 'Zzharg Madeye' }],
      [{ ...fakePosition, isStarPlayer: false }],
    );

    await expect(
      service.upsert({
        name: 'Zzharg Madeye',
        isStarPlayer: true,
        externalIds: [
          { externalSystemId: 1, externalId: 'Zzharg Madeye' },
          { externalSystemId: 2, externalId: 'Zzharg Madeye' },
        ],
      }),
    ).rejects.toThrow(PositionUpsertConflictError);
    expect(chains).toHaveLength(2);
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('rejects as a conflict when a regular position external id matches an existing star position', async () => {
    // Same collision, opposite direction: the existing matched row is
    // already a star position, but the incoming payload says regular.
    const { db, chains } = await build(
      [{ ownerId: 1, externalSystemId: 1, externalId: 'Zzharg Madeye' }],
      [{ ...fakePosition, isStarPlayer: true }],
    );

    await expect(
      service.upsert({
        name: 'Zzharg Madeye',
        isStarPlayer: false,
        externalIds: [
          { externalSystemId: 1, externalId: 'Zzharg Madeye' },
          { externalSystemId: 2, externalId: 'Orc: Zzharg Madeye' },
        ],
      }),
    ).rejects.toThrow(PositionUpsertConflictError);
    expect(chains).toHaveLength(2);
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  describe('syncRaceEras', () => {
    it('resolves (raceId, eraId) pairs to race_era ids and inserts positions_race_eras rows', async () => {
      // query 0: resolve race_eras for the given race ids; query 1: existing
      // positions_race_eras rows for the position; query 2: insert the newly
      // resolved links.
      const { chains } = await build(
        [
          { id: 100, raceId: 2, eraId: 5 },
          { id: 101, raceId: 2, eraId: 6 },
        ],
        [],
      );

      const result = await service.syncRaceEras({
        positionId: 1,
        raceEras: [
          { raceId: 2, eraId: 5 },
          { raceId: 2, eraId: 6 },
        ],
      });

      expect(result).toEqual({ positionId: 1, raceEraIds: [100, 101] });
      expect(chains).toHaveLength(3);
      expect(firstCallArg(chains[2].values)).toEqual([
        { positionId: 1, raceEraId: 100 },
        { positionId: 1, raceEraId: 101 },
      ]);
    });

    it('does not re-insert an already-present positions_race_eras row', async () => {
      const { chains } = await build(
        [
          { id: 100, raceId: 2, eraId: 5 },
          { id: 101, raceId: 2, eraId: 6 },
        ],
        [{ raceEraId: 100 }],
      );

      const result = await service.syncRaceEras({
        positionId: 1,
        raceEras: [
          { raceId: 2, eraId: 5 },
          { raceId: 2, eraId: 6 },
        ],
      });

      expect(result).toEqual({ positionId: 1, raceEraIds: [100, 101] });
      expect(chains).toHaveLength(3);
      expect(firstCallArg(chains[2].values)).toEqual([
        { positionId: 1, raceEraId: 101 },
      ]);
    });

    it('skips a (raceId, eraId) pair that has no matching race_era row', async () => {
      const { chains } = await build([{ id: 100, raceId: 2, eraId: 5 }], []);

      const result = await service.syncRaceEras({
        positionId: 1,
        raceEras: [
          { raceId: 2, eraId: 5 },
          { raceId: 2, eraId: 6 },
        ],
      });

      expect(result).toEqual({ positionId: 1, raceEraIds: [100] });
      expect(firstCallArg(chains[2].values)).toEqual([
        { positionId: 1, raceEraId: 100 },
      ]);
    });

    it('dedupes duplicate resolved race_era ids so only one row is inserted', async () => {
      const { chains } = await build(
        [
          { id: 100, raceId: 2, eraId: 5 },
          { id: 100, raceId: 3, eraId: 5 },
        ],
        [],
      );

      const result = await service.syncRaceEras({
        positionId: 1,
        raceEras: [
          { raceId: 2, eraId: 5 },
          { raceId: 3, eraId: 5 },
        ],
      });

      expect(result).toEqual({ positionId: 1, raceEraIds: [100] });
      expect(firstCallArg(chains[2].values)).toEqual([
        { positionId: 1, raceEraId: 100 },
      ]);
    });

    it('returns an empty list and inserts nothing for empty input', async () => {
      const { db, chains } = await build([], []);

      const result = await service.syncRaceEras({
        positionId: 1,
        raceEras: [],
      });

      expect(result).toEqual({ positionId: 1, raceEraIds: [] });
      // `raceEras.length === 0` returns before issuing any query.
      expect(chains).toHaveLength(0);
      expect(db.insert).not.toHaveBeenCalled();
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
    it('counts distinct positions available in the era via positions_race_eras', async () => {
      const { chains } = await build([{ count: 40 }]);
      await expect(service.countByEra(5)).resolves.toBe(40);
      expect(chains[0].innerJoin).toHaveBeenCalledTimes(1);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['race_eras.id', 'positions_race_eras.race_era_id']);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(5);
    });
  });

  describe('countByLeague', () => {
    it('counts distinct positions available in the league via positions_race_eras', async () => {
      const { chains } = await build([{ count: 60 }]);
      await expect(service.countByLeague(9)).resolves.toBe(60);
      expect(chains[0].innerJoin).toHaveBeenCalledTimes(2);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['race_eras.id', 'positions_race_eras.race_era_id']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 1, 1)),
      ).toEqual(['eras.id', 'race_eras.era_id']);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(9);
    });
  });

  describe('countByCompetition', () => {
    it('counts distinct positions available for each team-era in the competition', async () => {
      const { chains } = await build([{ count: 25 }]);
      await expect(service.countByCompetition(7)).resolves.toBe(25);
      expect(chains[0].innerJoin).toHaveBeenCalledTimes(4);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['team_eras.id', 'competition_teams.team_era_id']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 1, 1)),
      ).toEqual(['teams.id', 'team_eras.team_id']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 2, 1)),
      ).toEqual([
        'race_eras.race_id',
        'teams.race_id',
        'race_eras.era_id',
        'team_eras.era_id',
      ]);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 3, 1)),
      ).toEqual(['positions_race_eras.race_era_id', 'race_eras.id']);
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(7);
    });
  });

  describe('findById', () => {
    it('returns the position name with its deduplicated races', async () => {
      await build([
        { name: 'Blitzer', raceId: 2, raceName: 'Human' },
        { name: 'Blitzer', raceId: 2, raceName: 'Human' },
        { name: 'Blitzer', raceId: 5, raceName: 'Orc' },
      ]);

      await expect(service.findById(1)).resolves.toEqual({
        name: 'Blitzer',
        races: [
          { id: 2, name: 'Human' },
          { id: 5, name: 'Orc' },
        ],
      });
    });

    it('returns the position with an empty race list when it has no race eras', async () => {
      await build([{ name: 'Blitzer', raceId: null, raceName: null }]);

      await expect(service.findById(1)).resolves.toEqual({
        name: 'Blitzer',
        races: [],
      });
    });

    it('returns undefined when no such position exists', async () => {
      await build([]);

      await expect(service.findById(999)).resolves.toBeUndefined();
    });

    it('filters on the requested position id', async () => {
      const { chains } = await build([
        { name: 'Blitzer', raceId: 2, raceName: 'Human' },
      ]);

      await service.findById(7);

      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(7);
    });
  });

  describe('countPlayers', () => {
    it('returns the count the query resolves to', async () => {
      await build([{ count: 42 }]);

      await expect(service.countPlayers(1)).resolves.toBe(42);
    });

    it('filters on the requested position id', async () => {
      const { chains } = await build([{ count: 0 }]);

      await service.countPlayers(7);

      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(7);
    });
  });

  describe('countPlayersByPosition', () => {
    const rows = [
      { positionId: 1, name: 'Lineman', raceName: 'Orc', count: 120 },
      { positionId: 2, name: 'Lineman', raceName: 'Human', count: 120 },
      { positionId: 3, name: 'Blitzer', raceName: 'Orc', count: 44 },
    ];

    it('returns the rows the query resolves to, in the order the query produced them', async () => {
      const { db } = await build(rows);

      await expect(
        service.countPlayersByPosition(FACT_SCOPE_ALL_TIME, 21),
      ).resolves.toEqual(rows);
      expect(db.select).toHaveBeenCalledTimes(1);
    });

    it('returns an empty array when no position has any player', async () => {
      await build([]);

      await expect(
        service.countPlayersByPosition(FACT_SCOPE_ALL_TIME, 21),
      ).resolves.toEqual([]);
    });

    it('forwards the requested limit', async () => {
      const { chains } = await build(rows);

      await service.countPlayersByPosition(FACT_SCOPE_ALL_TIME, 21);

      expect(firstCallArg(chains[0].limit)).toBe(21);
    });

    it('excludes star positions', async () => {
      const { chains } = await build(rows);

      await service.countPlayersByPosition(FACT_SCOPE_ALL_TIME, 21);

      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(extractJoinColumns(firstCallArg(chains[0].where))).toEqual([
        'positions.is_star_player',
      ]);
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(false);
    });

    it('aggregates the race name with min(), so a position with more than one distinct race name resolves to one row', async () => {
      const { db } = await build(rows);

      await service.countPlayersByPosition(FACT_SCOPE_ALL_TIME, 21);

      const selectedFields = firstCallArg(db.select, 0, 0) as {
        raceName: unknown;
      };
      expect(sqlText(selectedFields.raceName)).toContain('min(');
    });

    it('counts distinct players so the race-era joins cannot double-count', async () => {
      // A position available in several eras joins to one positions_race_eras
      // row per era, fanning each of its players out to several rows. Only a
      // DISTINCT aggregate keeps the count honest.
      const { db } = await build(rows);

      await service.countPlayersByPosition(FACT_SCOPE_ALL_TIME, 21);

      const selectedFields = firstCallArg(db.select, 0, 0) as {
        count: unknown;
      };
      expect(isCountDistinct(selectedFields.count)).toBe(true);
    });

    it('joins race eras and players without an era join when unscoped', async () => {
      const { chains } = await build(rows);

      await service.countPlayersByPosition(FACT_SCOPE_ALL_TIME, 21);

      expect(chains[0].innerJoin).toHaveBeenCalledTimes(4);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 3, 1)),
      ).toEqual(['players.position_id', 'positions.id']);
    });

    it('scopes to an era through the player own team era', async () => {
      const eraRows = [
        { positionId: 1, name: 'Lineman', raceName: 'Orc', count: 8 },
      ];
      const { chains } = await build(eraRows);

      await expect(
        service.countPlayersByPosition({ eraId: 20 }, 21),
      ).resolves.toEqual(eraRows);
      // Era path adds one innerJoin (team_eras) on top of the four unscoped ones.
      expect(chains[0].innerJoin).toHaveBeenCalledTimes(5);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 4, 1)),
      ).toEqual(['team_eras.id', 'players.team_era_id', 'team_eras.era_id']);
    });

    it('scopes to a league through the eras of the player own team era', async () => {
      const leagueRows = [
        { positionId: 1, name: 'Lineman', raceName: 'Orc', count: 5 },
      ];
      const { chains } = await build(leagueRows);

      await expect(
        service.countPlayersByPosition({ leagueId: 9 }, 21),
      ).resolves.toEqual(leagueRows);
      // League path adds two innerJoins (team_eras + eras) on top of the four.
      expect(chains[0].innerJoin).toHaveBeenCalledTimes(6);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 4, 1)),
      ).toEqual(['team_eras.id', 'players.team_era_id']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 5, 1)),
      ).toEqual(['eras.id', 'team_eras.era_id', 'eras.league_id']);
    });

    it('groups by the position alone (not by race), and orders by the player count descending', async () => {
      const { chains } = await build(rows);

      await service.countPlayersByPosition(FACT_SCOPE_ALL_TIME, 21);

      expect(chains[0].orderBy).toHaveBeenCalledTimes(1);
      expect(chains[0].groupBy).toHaveBeenCalledTimes(1);
      expect(chains[0].groupBy.mock.calls[0]).toHaveLength(2);
      expect(extractJoinColumns(firstCallArg(chains[0].groupBy, 0, 0))).toEqual(
        ['positions.id'],
      );
      expect(extractJoinColumns(firstCallArg(chains[0].groupBy, 0, 1))).toEqual(
        ['positions.name'],
      );

      const orderByArg = firstCallArg(chains[0].orderBy);
      expect(extractJoinColumns(orderByArg)).toEqual(['players.id']);
      expect(sqlText(orderByArg)).toContain('distinct');
      expect(sqlText(orderByArg)).toContain(' desc');
    });
  });

  describe('listTopPlayersBySpp', () => {
    it('returns the player rows and forwards the limit', async () => {
      const rows = [
        { id: 9, name: 'Griff', sppTotal: 130 },
        { id: 10, name: 'Varag', sppTotal: 88 },
      ];
      const { chains } = await build(rows);

      await expect(service.listTopPlayersBySpp(1, 10)).resolves.toEqual(rows);
      expect(firstCallArg(chains[0].limit)).toBe(10);
    });

    it('orders by SPP total descending, then by player name', async () => {
      const { chains } = await build([]);

      await service.listTopPlayersBySpp(1, 10);

      expect(extractJoinColumns(firstCallArg(chains[0].orderBy, 0, 0))).toEqual(
        ['players.spp_total'],
      );
      expect(extractJoinColumns(firstCallArg(chains[0].orderBy, 0, 1))).toEqual(
        ['players.name'],
      );
    });
  });

  describe('searchByNamePrefix', () => {
    it('escapes the typed prefix before building the LIKE pattern', async () => {
      likePattern.escape.mockReturnValue('50\\%');
      const { chains } = await build([{ id: 1, name: '50% Blitzer' }]);

      await service.searchByNamePrefix('50%', 25);

      // `ilike()`'s value isn't recoverable via `extractFilterValues` (it
      // embeds the raw interpolated value directly in the SQL query chunks
      // rather than as a `Param`, the same reason `RacesService`'s own
      // `searchByNamePrefix` spec doesn't attempt this assertion either), so
      // this instead confirms the escaped pattern reached `where()` at all by
      // checking it was called, and that the escape step ran on the raw
      // typed prefix.
      expect(likePattern.escape).toHaveBeenCalledWith('50%');
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(firstCallArg(chains[0].limit)).toBe(25);
    });

    it('returns the id/name rows the query resolves to', async () => {
      likePattern.escape.mockReturnValue('Bl');
      const rows = [{ id: 1, name: 'Blitzer' }];
      await build(rows);

      await expect(service.searchByNamePrefix('Bl', 25)).resolves.toEqual(rows);
    });
  });

  describe('searchByNamePrefixWithRace', () => {
    it('escapes the typed prefix before building the LIKE pattern', async () => {
      likePattern.escape.mockReturnValue('50\\%');
      const { chains } = await build([
        { id: 1, name: '50% Blitzer', raceName: 'Human' },
      ]);

      await service.searchByNamePrefixWithRace('50%', 25);

      // `ilike()`'s value isn't recoverable via `extractFilterValues` (it
      // embeds the raw interpolated value directly in the SQL query chunks
      // rather than as a `Param`), so this instead confirms the escaped
      // pattern reached `where()` at all and that the escape step ran on the
      // raw typed prefix.
      expect(likePattern.escape).toHaveBeenCalledWith('50%');
      expect(chains[0].where).toHaveBeenCalledTimes(1);
      expect(firstCallArg(chains[0].limit)).toBe(25);
    });

    it('returns one row per position/race pair the query resolves to', async () => {
      likePattern.escape.mockReturnValue('Li');
      const rows = [
        { id: 1, name: 'Lineman', raceName: 'Human' },
        { id: 2, name: 'Lineman', raceName: 'Orc' },
      ];
      await build(rows);

      await expect(
        service.searchByNamePrefixWithRace('Li', 25),
      ).resolves.toEqual(rows);
    });

    it('selects distinct position/race pairs so multiple eras collapse to one row', async () => {
      likePattern.escape.mockReturnValue('Li');
      const { db } = await build([]);

      await service.searchByNamePrefixWithRace('Li', 25);

      expect(db.selectDistinct).toHaveBeenCalledTimes(1);
      expect(Object.keys(firstCallArg(db.selectDistinct) as object)).toEqual([
        'id',
        'name',
        'raceName',
      ]);
    });

    it('reaches the race through positions_race_eras and race_eras', async () => {
      likePattern.escape.mockReturnValue('Li');
      const { chains } = await build([]);

      await service.searchByNamePrefixWithRace('Li', 25);

      expect(chains[0].innerJoin).toHaveBeenCalledTimes(3);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1)),
      ).toEqual(['positions_race_eras.position_id', 'positions.id']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 1, 1)),
      ).toEqual(['race_eras.id', 'positions_race_eras.race_era_id']);
      expect(
        extractJoinColumns(firstCallArg(chains[0].innerJoin, 2, 1)),
      ).toEqual(['races.id', 'race_eras.race_id']);
    });

    it('orders by position name, then race name, and limits after the fan-out', async () => {
      likePattern.escape.mockReturnValue('Li');
      const { chains } = await build([]);

      await service.searchByNamePrefixWithRace('Li', 25);

      expect(extractJoinColumns(firstCallArg(chains[0].orderBy, 0, 0))).toEqual(
        ['positions.name'],
      );
      expect(extractJoinColumns(firstCallArg(chains[0].orderBy, 0, 1))).toEqual(
        ['races.name'],
      );
      // One statement, so the LIMIT necessarily applies to the joined,
      // deduplicated result — a multi-race position consumes one slot per
      // race rather than one slot total.
      expect(chains).toHaveLength(1);
      expect(firstCallArg(chains[0].limit)).toBe(25);
    });
  });
});
