import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { DownloadBackupService } from '../download-backup/download-backup.service';
import { LocalMigrationsService } from '../migrations/local-migrations.service';
import { LocalDatabaseGuardService } from '../pg-client/local-database-guard.service';
import { PgRestoreService } from '../restore/pg-restore.service';
import { TempDirService } from '../temp-dir/temp-dir.service';
import { BackupChecksService } from './backup-checks.service';
import { RestoredDatabaseQueryService } from './restored-database-query.service';
import { VerifyBackupService } from './verify-backup.service';

const TARGET = 'postgresql://postgres:postgres@localhost:5432/postgres';
const KEY = 'production/2026-10-14T03-17-00.000Z.dump';
const WORK_DIR = '/tmp/backup-cli-verify-abc123';
const DUMP_PATH = `${WORK_DIR}/backup.dump`;
const COUNTS = {
  coaches: 1,
  teams: 1,
  players: 1,
  matches: 1,
  competitions: 1,
};

describe('VerifyBackupService', () => {
  let service: VerifyBackupService;
  let guard: MockProxy<LocalDatabaseGuardService>;
  let tempDir: MockProxy<TempDirService>;
  let download: MockProxy<DownloadBackupService>;
  let pgRestore: MockProxy<PgRestoreService>;
  let query: MockProxy<RestoredDatabaseQueryService>;
  let localMigrations: MockProxy<LocalMigrationsService>;
  let checks: MockProxy<BackupChecksService>;

  beforeEach(async () => {
    guard = mock<LocalDatabaseGuardService>();
    tempDir = mock<TempDirService>();
    download = mock<DownloadBackupService>();
    pgRestore = mock<PgRestoreService>();
    query = mock<RestoredDatabaseQueryService>();
    localMigrations = mock<LocalMigrationsService>();
    checks = mock<BackupChecksService>();

    // Canned pass-through: hands the work a fixed directory. Creating and
    // removing it is TempDirService's own, separately tested, job.
    tempDir.run.mockImplementation(
      (_prefix: string, work: (dir: string) => Promise<unknown>) =>
        work(WORK_DIR),
    );
    localMigrations.list.mockReturnValue(['0001_a', '0002_b']);
    download.run.mockImplementation((request) =>
      Promise.resolve({
        key: request.key ?? KEY,
        path: request.destinationPath,
        sizeBytes: 5,
      }),
    );
    query.appliedMigrations.mockResolvedValue(['0001_a', '0002_b']);
    query.keyTableRowCounts.mockResolvedValue(COUNTS);
    checks.checkMigrations.mockReturnValue([]);
    checks.checkTableRowCounts.mockReturnValue([]);

    const moduleRef = await Test.createTestingModule({
      providers: [
        VerifyBackupService,
        { provide: LocalDatabaseGuardService, useValue: guard },
        { provide: TempDirService, useValue: tempDir },
        { provide: DownloadBackupService, useValue: download },
        { provide: PgRestoreService, useValue: pgRestore },
        { provide: RestoredDatabaseQueryService, useValue: query },
        { provide: LocalMigrationsService, useValue: localMigrations },
        { provide: BackupChecksService, useValue: checks },
      ],
    }).compile();
    service = moduleRef.get(VerifyBackupService);
  });

  it('downloads the newest backup into a temporary directory, restores it, checks it, and reports the result', async () => {
    await expect(service.run({ targetDatabaseUrl: TARGET })).resolves.toEqual({
      key: KEY,
      restoredMigrations: 2,
      tableRowCounts: COUNTS,
    });
    expect(tempDir.run).toHaveBeenCalledWith(
      'backup-cli-verify-',
      expect.any(Function),
    );
    expect(download.run).toHaveBeenCalledWith({
      destinationPath: DUMP_PATH,
      key: undefined,
    });
    expect(pgRestore.restore).toHaveBeenCalledWith({
      dumpPath: DUMP_PATH,
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

  it('propagates a failed restore without querying the database', async () => {
    pgRestore.restore.mockRejectedValue(
      new Error('pg_restore exited with code 1: boom'),
    );

    await expect(service.run({ targetDatabaseUrl: TARGET })).rejects.toThrow(
      'pg_restore exited with code 1: boom',
    );
    expect(query.appliedMigrations).not.toHaveBeenCalled();
  });

  it('fails listing every failed check, not just the first', async () => {
    checks.checkMigrations.mockReturnValue(['migration problem']);
    checks.checkTableRowCounts.mockReturnValue([
      'game_data.teams has no rows.',
      'game_data.matches has no rows.',
    ]);

    await expect(service.run({ targetDatabaseUrl: TARGET })).rejects.toThrow(
      new Error(
        `Backup ${KEY} failed verification:\n` +
          '- migration problem\n' +
          '- game_data.teams has no rows.\n' +
          '- game_data.matches has no rows.',
      ),
    );
  });

  it('checks that the target is local', async () => {
    await service.run({ targetDatabaseUrl: TARGET });

    expect(guard.assertLocal).toHaveBeenCalledWith(TARGET);
  });

  it('creates no temporary directory and downloads nothing when the target is refused', async () => {
    guard.assertLocal.mockImplementation(() => {
      throw new Error('Refusing to restore into a non-local database');
    });

    await expect(service.run({ targetDatabaseUrl: TARGET })).rejects.toThrow(
      'Refusing to restore into a non-local database',
    );
    expect(localMigrations.list).not.toHaveBeenCalled();
    expect(tempDir.run).not.toHaveBeenCalled();
    expect(download.run).not.toHaveBeenCalled();
  });

  it('fails before downloading when the checkout has no migrations', async () => {
    localMigrations.list.mockImplementation(() => {
      throw new Error('No migrations found in /x');
    });

    await expect(service.run({ targetDatabaseUrl: TARGET })).rejects.toThrow(
      'No migrations found in /x',
    );
    expect(tempDir.run).not.toHaveBeenCalled();
    expect(download.run).not.toHaveBeenCalled();
  });
});
