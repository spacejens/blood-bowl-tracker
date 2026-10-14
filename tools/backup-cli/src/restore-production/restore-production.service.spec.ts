import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { PgArchiveService } from '../archive/pg-archive.service';
import { DownloadBackupService } from '../download-backup/download-backup.service';
import { LocalMigrationsService } from '../migrations/local-migrations.service';
import { DatabaseUrlRedactorService } from '../pg-client/database-url-redactor.service';
import { ProductionDatabaseUrlService } from '../production-database/production-database-url.service';
import { TempDirService } from '../temp-dir/temp-dir.service';
import { RestoredDatabaseQueryService } from '../verify-backup/restored-database-query.service';
import { BackupInspectionService } from './backup-inspection.service';
import { ProductionRestoreService } from './production-restore.service';
import {
  RESTORE_PRODUCTION_CONFIRMATION,
  RestoreProductionRequest,
  RestoreProductionService,
} from './restore-production.service';

const PRODUCTION = 'postgresql://owner:hunter2@ep-x.neon.tech/neondb';
const MASKED = 'postgresql://owner:<password>@ep-x.neon.tech/neondb';
const KEY = 'production/2026-10-14T03-17-00.000Z.dump';
const WORK_DIR = '/tmp/backup-cli-restore-production-abc123';
const DUMP_PATH = `${WORK_DIR}/backup.dump`;
const SCRIPT_PATH = `${WORK_DIR}/restore.sql`;
const LOCAL = ['0001_a', '0002_b', '0003_c'];
const BACKUP_COUNTS = {
  coaches: 3,
  teams: 5,
  players: 70,
  matches: 9,
  competitions: 2,
};
const PRODUCTION_COUNTS = {
  coaches: 4,
  teams: 6,
  players: 80,
  matches: 12,
  competitions: 2,
};
const REAL: RestoreProductionRequest = {
  dryRun: false,
  confirm: RESTORE_PRODUCTION_CONFIRMATION,
};

describe('RestoreProductionService', () => {
  let service: RestoreProductionService;
  let productionUrl: MockProxy<ProductionDatabaseUrlService>;
  let redactor: MockProxy<DatabaseUrlRedactorService>;
  let localMigrations: MockProxy<LocalMigrationsService>;
  let tempDir: MockProxy<TempDirService>;
  let download: MockProxy<DownloadBackupService>;
  let inspection: MockProxy<BackupInspectionService>;
  let query: MockProxy<RestoredDatabaseQueryService>;
  let archive: MockProxy<PgArchiveService>;
  let productionRestore: MockProxy<ProductionRestoreService>;

  beforeEach(async () => {
    productionUrl = mock<ProductionDatabaseUrlService>();
    redactor = mock<DatabaseUrlRedactorService>();
    localMigrations = mock<LocalMigrationsService>();
    tempDir = mock<TempDirService>();
    download = mock<DownloadBackupService>();
    inspection = mock<BackupInspectionService>();
    query = mock<RestoredDatabaseQueryService>();
    archive = mock<PgArchiveService>();
    productionRestore = mock<ProductionRestoreService>();

    productionUrl.read.mockResolvedValue(PRODUCTION);
    redactor.mask.mockReturnValue(MASKED);
    localMigrations.list.mockReturnValue(LOCAL);
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
    inspection.inspect.mockResolvedValue({
      migrations: ['0001_a', '0002_b'],
      tableRowCounts: BACKUP_COUNTS,
    });
    query.keyTableRowCounts
      .mockResolvedValueOnce(PRODUCTION_COUNTS)
      .mockResolvedValueOnce(BACKUP_COUNTS);
    query.appliedMigrations.mockResolvedValue(['0001_a', '0002_b']);

    const moduleRef = await Test.createTestingModule({
      providers: [
        RestoreProductionService,
        { provide: ProductionDatabaseUrlService, useValue: productionUrl },
        { provide: DatabaseUrlRedactorService, useValue: redactor },
        { provide: LocalMigrationsService, useValue: localMigrations },
        { provide: TempDirService, useValue: tempDir },
        { provide: DownloadBackupService, useValue: download },
        { provide: BackupInspectionService, useValue: inspection },
        { provide: RestoredDatabaseQueryService, useValue: query },
        { provide: PgArchiveService, useValue: archive },
        { provide: ProductionRestoreService, useValue: productionRestore },
      ],
    }).compile();
    service = moduleRef.get(RestoreProductionService);
  });

  async function failure(request: RestoreProductionRequest): Promise<Error> {
    return service.run(request).then(
      () => {
        throw new Error('expected run() to fail');
      },
      (e: unknown) => e as Error,
    );
  }

  it.each([
    ['no confirmation', { dryRun: false }],
    ['the wrong phrase', { dryRun: false, confirm: 'yes' }],
    [
      'the phrase in another case',
      { dryRun: false, confirm: 'Blood-Bowl-Tracker-Discord-Bot' },
    ],
  ])(
    'refuses a real run with %s, before reading anything',
    async (_label, request: RestoreProductionRequest) => {
      const error = await failure(request);

      expect(error.message).toBe(
        'Refusing to restore into production without ' +
          `--confirm ${RESTORE_PRODUCTION_CONFIRMATION}; nothing was ` +
          'downloaded or changed. Use --dry-run to rehearse.',
      );
      expect(productionUrl.read).not.toHaveBeenCalled();
      expect(download.run).not.toHaveBeenCalled();
    },
  );

  it('dry run reports the backup beside production and writes nothing', async () => {
    await expect(service.run({ dryRun: true })).resolves.toEqual({
      mode: 'dry-run',
      key: KEY,
      backup: { migrations: 2, tableRowCounts: BACKUP_COUNTS },
      production: { tableRowCounts: PRODUCTION_COUNTS },
    });
    expect(inspection.inspect).toHaveBeenCalledWith({
      dumpPath: DUMP_PATH,
      workDir: WORK_DIR,
      localMigrations: LOCAL,
    });
    expect(query.keyTableRowCounts).toHaveBeenCalledWith(PRODUCTION);
    expect(archive.writeRestoreScript).not.toHaveBeenCalled();
    expect(productionRestore.restore).not.toHaveBeenCalled();
  });

  it('restores the newest backup into production and reports what came back', async () => {
    await expect(service.run(REAL)).resolves.toEqual({
      mode: 'restored',
      key: KEY,
      restoredMigrations: 2,
      tableRowCounts: BACKUP_COUNTS,
      previousTableRowCounts: PRODUCTION_COUNTS,
    });
    expect(tempDir.run).toHaveBeenCalledWith(
      'backup-cli-restore-production-',
      expect.any(Function),
    );
    expect(download.run).toHaveBeenCalledWith({
      destinationPath: DUMP_PATH,
      key: undefined,
    });
    expect(archive.writeRestoreScript).toHaveBeenCalledWith({
      dumpPath: DUMP_PATH,
      outputPath: SCRIPT_PATH,
    });
    expect(productionRestore.restore).toHaveBeenCalledWith({
      scriptPath: SCRIPT_PATH,
      databaseUrl: PRODUCTION,
    });
    expect(query.appliedMigrations).toHaveBeenCalledWith(PRODUCTION);
  });

  it('downloads and inspects before touching production', async () => {
    await service.run(REAL);

    const downloaded = download.run.mock.invocationCallOrder[0];
    const inspected = inspection.inspect.mock.invocationCallOrder[0];
    const read = query.keyTableRowCounts.mock.invocationCallOrder[0];
    const restored = productionRestore.restore.mock.invocationCallOrder[0];
    expect(downloaded).toBeLessThan(inspected);
    expect(inspected).toBeLessThan(read);
    expect(read).toBeLessThan(restored);
  });

  it('restores the named backup', async () => {
    await expect(
      service.run({ ...REAL, key: 'production/old.dump' }),
    ).resolves.toMatchObject({ key: 'production/old.dump' });
    expect(download.run).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'production/old.dump' }),
    );
  });

  it('reads the checkout migrations before downloading, so a broken checkout fails fast', async () => {
    localMigrations.list.mockImplementation(() => {
      throw new Error('No migrations found in /x');
    });

    await expect(service.run(REAL)).rejects.toThrow('No migrations found');
    expect(download.run).not.toHaveBeenCalled();
  });

  it('leaves production untouched when the download fails', async () => {
    download.run.mockRejectedValue(new Error('AccessDenied'));

    await expect(service.run(REAL)).rejects.toThrow('AccessDenied');
    expect(query.keyTableRowCounts).not.toHaveBeenCalled();
    expect(productionRestore.restore).not.toHaveBeenCalled();
  });

  it('leaves production untouched when the backup fails inspection', async () => {
    inspection.inspect.mockRejectedValue(
      new Error('The backup is not safe to restore into production'),
    );

    await expect(service.run(REAL)).rejects.toThrow('not safe to restore');
    expect(productionRestore.restore).not.toHaveBeenCalled();
  });

  it('says nothing changed when production cannot be read, with the password masked', async () => {
    query.keyTableRowCounts.mockReset();
    query.keyTableRowCounts.mockRejectedValue(
      new Error('psql exited with code 2: connection refused'),
    );

    const error = await failure(REAL);

    expect(redactor.mask).toHaveBeenCalledWith(PRODUCTION);
    expect(error.message).toBe(
      `Could not read ${MASKED} before restoring; nothing was changed. ` +
        'psql exited with code 2: connection refused',
    );
    expect(error.message).not.toContain('hunter2');
    expect(productionRestore.restore).not.toHaveBeenCalled();
  });

  it('says production is unchanged when the restore script cannot be written', async () => {
    archive.writeRestoreScript.mockRejectedValue(
      new Error('pg_restore could not read the backup (exit code 1): bad'),
    );

    const error = await failure(REAL);

    expect(error.message).toBe(
      `Could not prepare ${KEY} for restoring; ${MASKED} is unchanged. ` +
        'pg_restore could not read the backup (exit code 1): bad',
    );
    expect(productionRestore.restore).not.toHaveBeenCalled();
  });

  it('says production is unchanged when the restore fails, since it ran in one transaction', async () => {
    productionRestore.restore.mockRejectedValue(
      new Error('psql exited with code 3: ERROR: division by zero'),
    );

    const error = await failure(REAL);

    expect(error.message).toBe(
      `Restoring ${KEY} into ${MASKED} failed. The wipe and the restore run ` +
        'in one transaction, so production is unchanged. ' +
        'psql exited with code 3: ERROR: division by zero',
    );
    expect(error.message).not.toContain('hunter2');
    expect(query.appliedMigrations).not.toHaveBeenCalled();
  });

  it('describes a non-Error rejection too', async () => {
    productionRestore.restore.mockRejectedValue('boom');

    await expect(failure(REAL)).resolves.toHaveProperty(
      'message',
      expect.stringMatching(/production is unchanged\. boom$/),
    );
  });

  it('says the data is in place when reading back the restored database fails', async () => {
    query.appliedMigrations.mockRejectedValue(
      new Error('psql exited with code 1: timeout'),
    );

    const error = await failure(REAL);

    expect(error.message).toBe(
      `Restored ${KEY} into ${MASKED}, but reading the restored database ` +
        'back failed: psql exited with code 1: timeout',
    );
  });
});
