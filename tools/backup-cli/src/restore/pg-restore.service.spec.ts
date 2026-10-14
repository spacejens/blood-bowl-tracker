import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { PgClientService } from '../pg-client/pg-client.service';
import { PG_RESTORE_TIMEOUT_MS, PgRestoreService } from './pg-restore.service';

const DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/postgres';
const REQUEST = { dumpPath: '/tmp/x/backup.dump', databaseUrl: DATABASE_URL };

describe('PgRestoreService', () => {
  let service: PgRestoreService;
  let pgClient: MockProxy<PgClientService>;

  beforeEach(async () => {
    pgClient = mock<PgClientService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PgRestoreService,
        { provide: PgClientService, useValue: pgClient },
      ],
    }).compile();
    service = moduleRef.get(PgRestoreService);
  });

  it('restores the dump without owners or privileges, stopping at the first error', async () => {
    pgClient.run.mockResolvedValue('');

    await service.restore(REQUEST);

    expect(pgClient.run).toHaveBeenCalledWith({
      program: 'pg_restore',
      args: [
        '--no-owner',
        '--no-privileges',
        '--exit-on-error',
        '--single-transaction',
        '--no-password',
        '/tmp/x/backup.dump',
      ],
      databaseUrl: DATABASE_URL,
      timeoutMs: PG_RESTORE_TIMEOUT_MS,
    });
    expect(PG_RESTORE_TIMEOUT_MS).toBe(30 * 60 * 1000);
  });

  it('propagates a failed or timed-out restore', async () => {
    pgClient.run.mockRejectedValue(
      new Error('pg_restore timed out after 30 minutes.'),
    );

    await expect(service.restore(REQUEST)).rejects.toThrow(
      'pg_restore timed out after 30 minutes.',
    );
  });
});
