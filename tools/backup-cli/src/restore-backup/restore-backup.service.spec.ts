import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { BackupConfigService } from '../config/backup-config.service';
import { DownloadBackupService } from '../download-backup/download-backup.service';
import { DatabaseUrlRedactorService } from '../pg-client/database-url-redactor.service';
import { LocalDatabaseGuardService } from '../pg-client/local-database-guard.service';
import { PgRestoreService } from '../restore/pg-restore.service';
import { TempDirService } from '../temp-dir/temp-dir.service';
import { RestoredDatabaseQueryService } from '../verify-backup/restored-database-query.service';
import { LocalDatabaseWipeService } from './local-database-wipe.service';
import { RestoreBackupService } from './restore-backup.service';

const TARGET = 'postgres://blood_bowl:hunter2@localhost:5433/blood_bowl';
const MASKED = 'postgres://blood_bowl:<password>@localhost:5433/blood_bowl';
const KEY = 'production/2026-10-14T03-17-00.000Z.dump';
const WORK_DIR = '/tmp/backup-cli-restore-abc123';
const DUMP_PATH = `${WORK_DIR}/backup.dump`;
const COUNTS = {
  coaches: 3,
  teams: 5,
  players: 70,
  matches: 9,
  competitions: 2,
};

describe('RestoreBackupService', () => {
  let service: RestoreBackupService;
  let config: MockProxy<BackupConfigService>;
  let guard: MockProxy<LocalDatabaseGuardService>;
  let redactor: MockProxy<DatabaseUrlRedactorService>;
  let tempDir: MockProxy<TempDirService>;
  let download: MockProxy<DownloadBackupService>;
  let wipe: MockProxy<LocalDatabaseWipeService>;
  let pgRestore: MockProxy<PgRestoreService>;
  let query: MockProxy<RestoredDatabaseQueryService>;

  beforeEach(async () => {
    config = mock<BackupConfigService>();
    guard = mock<LocalDatabaseGuardService>();
    redactor = mock<DatabaseUrlRedactorService>();
    tempDir = mock<TempDirService>();
    download = mock<DownloadBackupService>();
    wipe = mock<LocalDatabaseWipeService>();
    pgRestore = mock<PgRestoreService>();
    query = mock<RestoredDatabaseQueryService>();

    config.getLocalDatabaseUrl.mockReturnValue(TARGET);
    redactor.mask.mockReturnValue(MASKED);
    // Canned pass-through: hands the work a fixed directory. Creating and
    // removing it is TempDirService's own, separately tested, job.
    tempDir.run.mockImplementation((_prefix, work) => work(WORK_DIR));
    download.run.mockImplementation((request) =>
      Promise.resolve({
        key: request.key ?? KEY,
        path: request.destinationPath,
        sizeBytes: 5,
      }),
    );
    query.appliedMigrations.mockResolvedValue(['0001_a', '0002_b']);
    query.keyTableRowCounts.mockResolvedValue(COUNTS);

    const moduleRef = await Test.createTestingModule({
      providers: [
        RestoreBackupService,
        { provide: BackupConfigService, useValue: config },
        { provide: LocalDatabaseGuardService, useValue: guard },
        { provide: DatabaseUrlRedactorService, useValue: redactor },
        { provide: TempDirService, useValue: tempDir },
        { provide: DownloadBackupService, useValue: download },
        { provide: LocalDatabaseWipeService, useValue: wipe },
        { provide: PgRestoreService, useValue: pgRestore },
        { provide: RestoredDatabaseQueryService, useValue: query },
      ],
    }).compile();
    service = moduleRef.get(RestoreBackupService);
  });

  async function failure(): Promise<Error | undefined> {
    return service.run({}).then(
      () => undefined,
      (e: unknown) => e as Error,
    );
  }

  it('restores the newest backup into the configured local database and reports what came back', async () => {
    await expect(service.run({})).resolves.toEqual({
      key: KEY,
      restoredMigrations: 2,
      tableRowCounts: COUNTS,
    });
    expect(guard.assertLocal).toHaveBeenCalledWith(TARGET);
    expect(tempDir.run).toHaveBeenCalledWith(
      'backup-cli-restore-',
      expect.any(Function),
    );
    expect(download.run).toHaveBeenCalledWith({
      destinationPath: DUMP_PATH,
      key: undefined,
    });
    expect(wipe.wipe).toHaveBeenCalledWith(TARGET);
    expect(pgRestore.restore).toHaveBeenCalledWith({
      dumpPath: DUMP_PATH,
      databaseUrl: TARGET,
    });
    expect(query.appliedMigrations).toHaveBeenCalledWith(TARGET);
    expect(query.keyTableRowCounts).toHaveBeenCalledWith(TARGET);
  });

  it('downloads before wiping, and wipes before restoring', async () => {
    await service.run({});

    const downloaded = download.run.mock.invocationCallOrder[0];
    const wiped = wipe.wipe.mock.invocationCallOrder[0];
    const restored = pgRestore.restore.mock.invocationCallOrder[0];
    expect(downloaded).toBeLessThan(wiped);
    expect(wiped).toBeLessThan(restored);
  });

  it('restores the named backup', async () => {
    await expect(
      service.run({ key: 'production/old.dump' }),
    ).resolves.toMatchObject({ key: 'production/old.dump' });
    expect(download.run).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'production/old.dump' }),
    );
  });

  it('touches nothing when the target is not local', async () => {
    guard.assertLocal.mockImplementation(() => {
      throw new Error('Refusing to restore into a non-local database');
    });

    await expect(service.run({})).rejects.toThrow(
      'Refusing to restore into a non-local database',
    );
    expect(tempDir.run).not.toHaveBeenCalled();
    expect(download.run).not.toHaveBeenCalled();
    expect(wipe.wipe).not.toHaveBeenCalled();
    expect(pgRestore.restore).not.toHaveBeenCalled();
  });

  it('leaves the database untouched when the download fails', async () => {
    download.run.mockRejectedValue(new Error('AccessDenied'));

    await expect(service.run({})).rejects.toThrow('AccessDenied');
    expect(wipe.wipe).not.toHaveBeenCalled();
    expect(pgRestore.restore).not.toHaveBeenCalled();
  });

  it('says the data is unchanged when the wipe fails, naming the target with its password masked', async () => {
    wipe.wipe.mockRejectedValue(new Error('psql exited with code 1: boom'));

    const error = await failure();

    expect(redactor.mask).toHaveBeenCalledWith(TARGET);
    expect(error?.message).toBe(
      `Could not clear ${MASKED} before restoring; its existing data is unchanged. ` +
        'psql exited with code 1: boom',
    );
    expect(error?.message).not.toContain('hunter2');
    expect(pgRestore.restore).not.toHaveBeenCalled();
  });

  it('says the database is now empty and to re-run when the restore fails after the wipe', async () => {
    pgRestore.restore.mockRejectedValue(
      new Error('pg_restore exited with code 1: boom'),
    );

    const error = await failure();

    expect(error?.message).toBe(
      `Restoring ${KEY} into ${MASKED} failed after the database was cleared, ` +
        'so it is now empty; re-run restore to try again. ' +
        'pg_restore exited with code 1: boom',
    );
    expect(error?.message).not.toContain('hunter2');
    expect(query.appliedMigrations).not.toHaveBeenCalled();
  });

  it('describes a non-Error rejection too', async () => {
    pgRestore.restore.mockRejectedValue('boom');

    await expect(failure()).resolves.toHaveProperty(
      'message',
      expect.stringMatching(/now empty; re-run restore to try again\. boom$/),
    );
  });

  it('says the data is in place when reading back the restored database fails, with the password masked', async () => {
    const cause = new Error('psql exited with code 1: relation does not exist');
    query.keyTableRowCounts.mockRejectedValue(cause);

    const error = await failure();

    expect(error?.message).toContain(
      `into ${MASKED}, but reading the restored database back failed: psql exited with code 1: relation does not exist`,
    );
    expect(error?.message).not.toContain('hunter2');
    expect(error?.cause).toBe(cause);
  });
});
