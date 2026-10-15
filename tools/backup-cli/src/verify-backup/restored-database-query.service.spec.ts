import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { PgClientService } from '../pg-client/pg-client.service';
import {
  PSQL_TIMEOUT_MS,
  RestoredDatabaseQueryService,
} from './restored-database-query.service';

const DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/postgres';

const PSQL_FLAGS = [
  '--no-psqlrc',
  '--tuples-only',
  '--no-align',
  '--set=ON_ERROR_STOP=1',
];

describe('RestoredDatabaseQueryService', () => {
  let service: RestoredDatabaseQueryService;
  let pgClient: MockProxy<PgClientService>;

  beforeEach(async () => {
    pgClient = mock<PgClientService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        RestoredDatabaseQueryService,
        { provide: PgClientService, useValue: pgClient },
      ],
    }).compile();
    service = moduleRef.get(RestoredDatabaseQueryService);
  });

  describe('appliedMigrations', () => {
    it('reads recorded migration names with unaligned, tuples-only psql', async () => {
      pgClient.run.mockResolvedValue('0001_a\n0002_b\n\n');

      await expect(service.appliedMigrations(DATABASE_URL)).resolves.toEqual([
        '0001_a',
        '0002_b',
      ]);
      expect(pgClient.run).toHaveBeenCalledWith({
        program: 'psql',
        args: [
          ...PSQL_FLAGS,
          '--command=SELECT name FROM drizzle.__drizzle_migrations WHERE name IS NOT NULL ORDER BY id;',
        ],
        databaseUrl: DATABASE_URL,
        timeoutMs: PSQL_TIMEOUT_MS,
      });
    });

    it('propagates a psql failure', async () => {
      pgClient.run.mockRejectedValue(new Error('psql exited with code 1: x'));

      await expect(service.appliedMigrations(DATABASE_URL)).rejects.toThrow(
        'psql exited with code 1: x',
      );
    });
  });

  describe('keyTableRowCounts', () => {
    it('counts every key table in one query', async () => {
      pgClient.run.mockResolvedValue(
        'coaches|3\nteams|0\nplayers|50\nmatches|9\ncompetitions|1\n',
      );

      await expect(service.keyTableRowCounts(DATABASE_URL)).resolves.toEqual({
        coaches: 3,
        teams: 0,
        players: 50,
        matches: 9,
        competitions: 1,
      });
      expect(pgClient.run).toHaveBeenCalledWith({
        program: 'psql',
        args: [
          ...PSQL_FLAGS,
          "--command=SELECT 'coaches', count(*) FROM game_data.coaches" +
            " UNION ALL SELECT 'teams', count(*) FROM game_data.teams" +
            " UNION ALL SELECT 'players', count(*) FROM game_data.players" +
            " UNION ALL SELECT 'matches', count(*) FROM game_data.matches" +
            " UNION ALL SELECT 'competitions', count(*) FROM game_data.competitions;",
        ],
        databaseUrl: DATABASE_URL,
        timeoutMs: PSQL_TIMEOUT_MS,
      });
    });

    it('counts only the tables it is given', async () => {
      pgClient.run.mockResolvedValue('teams|6\nmatches|12\n');

      await expect(
        service.keyTableRowCounts(DATABASE_URL, ['teams', 'matches']),
      ).resolves.toEqual({ teams: 6, matches: 12 });
      expect(pgClient.run).toHaveBeenCalledWith(
        expect.objectContaining({
          args: [
            ...PSQL_FLAGS,
            "--command=SELECT 'teams', count(*) FROM game_data.teams" +
              " UNION ALL SELECT 'matches', count(*) FROM game_data.matches;",
          ],
        }),
      );
    });

    it('returns no counts without querying when given no tables', async () => {
      await expect(
        service.keyTableRowCounts(DATABASE_URL, []),
      ).resolves.toEqual({});
      expect(pgClient.run).not.toHaveBeenCalled();
    });

    it('fails on output it cannot parse', async () => {
      pgClient.run.mockResolvedValue('coaches|\n');

      await expect(service.keyTableRowCounts(DATABASE_URL)).rejects.toThrow(
        'Unexpected psql output line: coaches|',
      );
    });
  });

  describe('existingKeyTables', () => {
    it('lists the key tables that exist, in key-table order, without touching them', async () => {
      pgClient.run.mockResolvedValue('teams\ncoaches\n\n');

      await expect(service.existingKeyTables(DATABASE_URL)).resolves.toEqual([
        'coaches',
        'teams',
      ]);
      expect(pgClient.run).toHaveBeenCalledWith({
        program: 'psql',
        args: [
          ...PSQL_FLAGS,
          '--command=SELECT tablename FROM pg_catalog.pg_tables ' +
            "WHERE schemaname = 'game_data' AND tablename IN " +
            "('coaches', 'teams', 'players', 'matches', 'competitions');",
        ],
        databaseUrl: DATABASE_URL,
        timeoutMs: PSQL_TIMEOUT_MS,
      });
    });

    it('lists nothing when the game_data schema is missing', async () => {
      pgClient.run.mockResolvedValue('');

      await expect(service.existingKeyTables(DATABASE_URL)).resolves.toEqual(
        [],
      );
    });

    it('propagates a connection failure', async () => {
      pgClient.run.mockRejectedValue(
        new Error('psql exited with code 2: connection refused'),
      );

      await expect(service.existingKeyTables(DATABASE_URL)).rejects.toThrow(
        'connection refused',
      );
    });
  });
});
