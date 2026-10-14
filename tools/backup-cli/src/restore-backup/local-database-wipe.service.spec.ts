import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { PgClientService } from '../pg-client/pg-client.service';
import { PSQL_TIMEOUT_MS } from '../verify-backup/restored-database-query.service';
import {
  LocalDatabaseWipeService,
  WIPE_SQL,
} from './local-database-wipe.service';

const DATABASE_URL =
  'postgres://blood_bowl:blood_bowl@localhost:5433/blood_bowl';

describe('LocalDatabaseWipeService', () => {
  let service: LocalDatabaseWipeService;
  let pgClient: MockProxy<PgClientService>;

  beforeEach(async () => {
    pgClient = mock<PgClientService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        LocalDatabaseWipeService,
        { provide: PgClientService, useValue: pgClient },
      ],
    }).compile();
    service = moduleRef.get(LocalDatabaseWipeService);
  });

  it('runs the wipe as one psql statement that stops on error', async () => {
    pgClient.run.mockResolvedValue('');

    await service.wipe(DATABASE_URL);

    expect(pgClient.run).toHaveBeenCalledWith({
      program: 'psql',
      args: [
        '--no-psqlrc',
        '--tuples-only',
        '--no-align',
        '--set=ON_ERROR_STOP=1',
        `--command=${WIPE_SQL}`,
      ],
      databaseUrl: DATABASE_URL,
      timeoutMs: PSQL_TIMEOUT_MS,
    });
  });

  it('drops every schema but the system ones, then recreates an empty public', () => {
    expect(WIPE_SQL).toMatch(/^DO \$\$/);
    expect(WIPE_SQL).toContain("nspname NOT LIKE 'pg\\_%'");
    expect(WIPE_SQL).toContain("nspname <> 'information_schema'");
    expect(WIPE_SQL).toContain(
      "EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', target);",
    );
    expect(WIPE_SQL.indexOf('CREATE SCHEMA public;')).toBeGreaterThan(
      WIPE_SQL.indexOf('DROP SCHEMA'),
    );
  });

  it('propagates a failed wipe', async () => {
    pgClient.run.mockRejectedValue(new Error('psql exited with code 1: boom'));

    await expect(service.wipe(DATABASE_URL)).rejects.toThrow(
      'psql exited with code 1: boom',
    );
  });
});
