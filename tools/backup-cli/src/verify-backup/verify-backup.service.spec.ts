import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { DownloadBackupService } from '../download-backup/download-backup.service';
import { LocalMigrationsService } from '../migrations/local-migrations.service';
import { LocalDatabaseGuardService } from '../pg-client/local-database-guard.service';
import { PgRestoreService } from '../restore/pg-restore.service';
import { BackupChecksService } from './backup-checks.service';
import { RestoredDatabaseQueryService } from './restored-database-query.service';
import { VerifyBackupService } from './verify-backup.service';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, rmSync: vi.fn(actual.rmSync) };
});

const TARGET = 'postgresql://postgres:postgres@localhost:5432/postgres';
const KEY = 'production/2026-10-14T03-17-00.000Z.dump';
const COUNTS = {
  coaches: 1,
  teams: 1,
  players: 1,
  matches: 1,
  competitions: 1,
};

describe('VerifyBackupService', () => {
  let service: VerifyBackupService;
  let download: MockProxy<DownloadBackupService>;
  let pgRestore: MockProxy<PgRestoreService>;
  let query: MockProxy<RestoredDatabaseQueryService>;
  let localMigrations: MockProxy<LocalMigrationsService>;
  let checks: MockProxy<BackupChecksService>;
  let guard: MockProxy<LocalDatabaseGuardService>;
  let downloadedPath: string | undefined;

  beforeEach(async () => {
    download = mock<DownloadBackupService>();
    pgRestore = mock<PgRestoreService>();
    query = mock<RestoredDatabaseQueryService>();
    localMigrations = mock<LocalMigrationsService>();
    checks = mock<BackupChecksService>();
    guard = mock<LocalDatabaseGuardService>();
    downloadedPath = undefined;

    localMigrations.list.mockReturnValue(['0001_a', '0002_b']);
    // Canned stand-in for the file the real download writes; echoes the
    // request rather than reimplementing newest-key selection.
    download.run.mockImplementation((request) => {
      downloadedPath = request.destinationPath;
      writeFileSync(request.destinationPath, 'PGDMP');
      return Promise.resolve({
        key: request.key ?? KEY,
        path: request.destinationPath,
        sizeBytes: 5,
      });
    });
    query.appliedMigrations.mockResolvedValue(['0001_a', '0002_b']);
    query.keyTableRowCounts.mockResolvedValue(COUNTS);
    checks.checkMigrations.mockReturnValue([]);
    checks.checkTableRowCounts.mockReturnValue([]);

    const moduleRef = await Test.createTestingModule({
      providers: [
        VerifyBackupService,
        { provide: DownloadBackupService, useValue: download },
        { provide: PgRestoreService, useValue: pgRestore },
        { provide: RestoredDatabaseQueryService, useValue: query },
        { provide: LocalMigrationsService, useValue: localMigrations },
        { provide: BackupChecksService, useValue: checks },
        { provide: LocalDatabaseGuardService, useValue: guard },
      ],
    }).compile();
    service = moduleRef.get(VerifyBackupService);
  });

  async function failure(url: string): Promise<Error | undefined> {
    return service.run({ targetDatabaseUrl: url }).then(
      () => undefined,
      (e: unknown) => e as Error,
    );
  }

  it('downloads the newest backup, restores it, checks it, and reports the result', async () => {
    await expect(service.run({ targetDatabaseUrl: TARGET })).resolves.toEqual({
      key: KEY,
      restoredMigrations: 2,
      tableRowCounts: COUNTS,
    });
    expect(download.run).toHaveBeenCalledWith({
      destinationPath: downloadedPath,
      key: undefined,
    });
    expect(pgRestore.restore).toHaveBeenCalledWith({
      dumpPath: downloadedPath,
      databaseUrl: TARGET,
    });
    expect(query.appliedMigrations).toHaveBeenCalledWith(TARGET);
    expect(query.keyTableRowCounts).toHaveBeenCalledWith(TARGET);
    expect(checks.checkMigrations).toHaveBeenCalledWith({
      restored: ['0001_a', '0002_b'],
      local: ['0001_a', '0002_b'],
    });
    expect(checks.checkTableRowCounts).toHaveBeenCalledWith(COUNTS);
  });

  it('verifies the named backup', async () => {
    await service.run({
      targetDatabaseUrl: TARGET,
      key: 'production/old.dump',
    });

    expect(download.run).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'production/old.dump' }),
    );
  });

  it('removes its temporary directory after success', async () => {
    await service.run({ targetDatabaseUrl: TARGET });

    expect(downloadedPath).toBeDefined();
    expect(existsSync(dirname(downloadedPath ?? ''))).toBe(false);
  });

  it('removes its temporary directory when the restore fails, and propagates the error', async () => {
    pgRestore.restore.mockRejectedValue(
      new Error('pg_restore exited with code 1: boom'),
    );

    await expect(service.run({ targetDatabaseUrl: TARGET })).rejects.toThrow(
      'pg_restore exited with code 1: boom',
    );
    expect(existsSync(dirname(downloadedPath ?? ''))).toBe(false);
    expect(query.appliedMigrations).not.toHaveBeenCalled();
  });

  it('does not let a cleanup failure mask the original error', async () => {
    pgRestore.restore.mockRejectedValue(new Error('pg_restore failed'));
    vi.mocked(rmSync).mockImplementationOnce(() => {
      throw new Error('EBUSY');
    });
    const stderr = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);

    await expect(service.run({ targetDatabaseUrl: TARGET })).rejects.toThrow(
      'pg_restore failed',
    );
    const written = stderr.mock.calls.map((call) => String(call[0])).join('');
    stderr.mockRestore();
    // The mocked removal failed, so remove the leftover directory here.
    rmSync(dirname(downloadedPath ?? ''), { recursive: true, force: true });
    expect(written).toContain('Could not remove temporary directory');
    expect(written).toContain('backup-cli-verify-');
    expect(written).not.toContain(TARGET);
    expect(written).not.toContain('postgres:postgres');
  });

  it('fails listing every failed check, not just the first', async () => {
    checks.checkMigrations.mockReturnValue(['migration problem']);
    checks.checkTableRowCounts.mockReturnValue([
      'game_data.teams has no rows.',
      'game_data.matches has no rows.',
    ]);

    const error = await failure(TARGET);

    expect(error?.message).toBe(
      `Backup ${KEY} failed verification:\n` +
        '- migration problem\n' +
        '- game_data.teams has no rows.\n' +
        '- game_data.matches has no rows.',
    );
  });

  it('checks that the target is local', async () => {
    await service.run({ targetDatabaseUrl: TARGET });

    expect(guard.assertLocal).toHaveBeenCalledWith(TARGET);
  });

  it('downloads nothing when the target is refused', async () => {
    guard.assertLocal.mockImplementation(() => {
      throw new Error('Refusing to restore into a non-local database');
    });

    await expect(service.run({ targetDatabaseUrl: TARGET })).rejects.toThrow(
      'Refusing to restore into a non-local database',
    );
    expect(localMigrations.list).not.toHaveBeenCalled();
    expect(download.run).not.toHaveBeenCalled();
  });

  it('fails before downloading when the checkout has no migrations', async () => {
    localMigrations.list.mockImplementation(() => {
      throw new Error('No migrations found in /x');
    });

    await expect(service.run({ targetDatabaseUrl: TARGET })).rejects.toThrow(
      'No migrations found in /x',
    );
    expect(download.run).not.toHaveBeenCalled();
  });
});
