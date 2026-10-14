import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ProcessRunnerService,
  TIMED_OUT_EXIT_CODE,
} from '@blood-bowl-tracker/cli-shared';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { PG_RESTORE_TIMEOUT_MS } from '../restore/pg-restore.service';
import { PgArchiveService } from './pg-archive.service';

const DUMP = '/tmp/x/backup.dump';

describe('PgArchiveService', () => {
  let service: PgArchiveService;
  let processRunner: MockProxy<ProcessRunnerService>;
  let dir: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'backup-cli-archive-'));
    processRunner = mock<ProcessRunnerService>();
    processRunner.run.mockResolvedValue({
      exitCode: 0,
      stdout: 'listing',
      stderr: '',
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        PgArchiveService,
        { provide: ProcessRunnerService, useValue: processRunner },
      ],
    }).compile();
    service = moduleRef.get(PgArchiveService);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('lists the archive table of contents', async () => {
    await expect(service.listContents(DUMP)).resolves.toBe('listing');
    expect(processRunner.run).toHaveBeenCalledWith(
      'pg_restore',
      ['--list', DUMP],
      PG_RESTORE_TIMEOUT_MS,
    );
  });

  it('writes a data-only script of the migrations and key tables and returns it', async () => {
    const outputPath = join(dir, 'backup-data.sql');
    processRunner.run.mockImplementation(() => {
      // Canned stand-in for pg_restore writing its --file.
      writeFileSync(outputPath, 'COPY ...');
      return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
    });

    await expect(
      service.extractData({ dumpPath: DUMP, outputPath }),
    ).resolves.toBe('COPY ...');
    expect(processRunner.run).toHaveBeenCalledWith(
      'pg_restore',
      [
        '--data-only',
        '--schema=drizzle',
        '--schema=game_data',
        '--table=__drizzle_migrations',
        '--table=coaches',
        '--table=teams',
        '--table=players',
        '--table=matches',
        '--table=competitions',
        `--file=${outputPath}`,
        DUMP,
      ],
      PG_RESTORE_TIMEOUT_MS,
    );
  });

  it('writes a full restore script without owners or privileges', async () => {
    const outputPath = join(dir, 'restore.sql');

    await service.writeRestoreScript({ dumpPath: DUMP, outputPath });

    expect(processRunner.run).toHaveBeenCalledWith(
      'pg_restore',
      ['--no-owner', '--no-privileges', `--file=${outputPath}`, DUMP],
      PG_RESTORE_TIMEOUT_MS,
    );
  });

  it('throws with stderr when pg_restore exits non-zero', async () => {
    processRunner.run.mockResolvedValue({
      exitCode: 1,
      stdout: '',
      stderr:
        'pg_restore: error: input file does not appear to be a valid archive\n',
    });

    await expect(service.listContents(DUMP)).rejects.toThrow(
      'pg_restore could not read the backup (exit code 1): ' +
        'pg_restore: error: input file does not appear to be a valid archive',
    );
  });

  it('throws when pg_restore times out', async () => {
    processRunner.run.mockResolvedValue({
      exitCode: TIMED_OUT_EXIT_CODE,
      stdout: '',
      stderr: '',
    });

    await expect(service.listContents(DUMP)).rejects.toThrow(
      'pg_restore timed out after 30 minutes reading the backup.',
    );
  });

  it('propagates a failure to start pg_restore', async () => {
    processRunner.run.mockRejectedValue(new Error('spawn pg_restore ENOENT'));

    await expect(
      service.writeRestoreScript({ dumpPath: DUMP, outputPath: '/x' }),
    ).rejects.toThrow('spawn pg_restore ENOENT');
  });
});
