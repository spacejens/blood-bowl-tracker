import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { PgClientService } from '../pg-client/pg-client.service';
import { PG_RESTORE_TIMEOUT_MS } from '../restore/pg-restore.service';
import { APPLICATION_SCHEMAS } from './application-schemas';
import {
  PRODUCTION_WIPE_SQL,
  ProductionRestoreService,
} from './production-restore.service';

const DATABASE_URL = 'postgresql://owner:hunter2@ep-x.neon.tech/neondb';
const SCRIPT = '/tmp/backup-cli-restore-production-abc/restore.sql';

describe('ProductionRestoreService', () => {
  let service: ProductionRestoreService;
  let pgClient: MockProxy<PgClientService>;

  beforeEach(async () => {
    pgClient = mock<PgClientService>();
    pgClient.run.mockResolvedValue('');
    const moduleRef = await Test.createTestingModule({
      providers: [
        ProductionRestoreService,
        { provide: PgClientService, useValue: pgClient },
      ],
    }).compile();
    service = moduleRef.get(ProductionRestoreService);
  });

  it('wipes the application schemas and runs the restore script in one psql transaction', async () => {
    await service.restore({ scriptPath: SCRIPT, databaseUrl: DATABASE_URL });

    expect(pgClient.run).toHaveBeenCalledWith({
      program: 'psql',
      args: [
        '--no-psqlrc',
        '--quiet',
        '--set=ON_ERROR_STOP=1',
        '--single-transaction',
        `--command=${PRODUCTION_WIPE_SQL}`,
        `--file=${SCRIPT}`,
      ],
      databaseUrl: DATABASE_URL,
      timeoutMs: PG_RESTORE_TIMEOUT_MS,
    });
  });

  it('drops exactly the four application schemas and recreates an empty public', () => {
    expect(APPLICATION_SCHEMAS).toEqual([
      'game_data',
      'discord_bot_usage',
      'drizzle',
      'public',
    ]);
    expect(PRODUCTION_WIPE_SQL).toBe(
      [
        'DROP SCHEMA IF EXISTS game_data CASCADE;',
        'DROP SCHEMA IF EXISTS discord_bot_usage CASCADE;',
        'DROP SCHEMA IF EXISTS drizzle CASCADE;',
        'DROP SCHEMA IF EXISTS public CASCADE;',
        'CREATE SCHEMA public;',
      ].join('\n'),
    );
  });

  it('propagates a failed restore', async () => {
    pgClient.run.mockRejectedValue(
      new Error('psql exited with code 3: ERROR: division by zero'),
    );

    await expect(
      service.restore({ scriptPath: SCRIPT, databaseUrl: DATABASE_URL }),
    ).rejects.toThrow('psql exited with code 3: ERROR: division by zero');
  });
});
