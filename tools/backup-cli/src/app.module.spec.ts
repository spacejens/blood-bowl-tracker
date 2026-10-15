import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ProcessRunnerService } from '@blood-bowl-tracker/cli-shared';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { AppModule } from './app.module';
import { ArchiveParserService } from './archive/archive-parser.service';
import { PgArchiveService } from './archive/pg-archive.service';
import { BackupFreshnessService } from './check-freshness/backup-freshness.service';
import { CheckFreshnessService } from './check-freshness/check-freshness.service';
import {
  BACKUP_CONFIG_PATH,
  BACKUP_ENV,
  BackupConfigService,
} from './config/backup-config.service';
import { CreateBackupService } from './create-backup/create-backup.service';
import { DownloadBackupService } from './download-backup/download-backup.service';
import { PgDumpService } from './dump/pg-dump.service';
import { LocalMigrationsService } from './migrations/local-migrations.service';
import { DatabaseUrlRedactorService } from './pg-client/database-url-redactor.service';
import { LocalDatabaseGuardService } from './pg-client/local-database-guard.service';
import { PgClientService } from './pg-client/pg-client.service';
import { ProductionDatabaseUrlService } from './production-database/production-database-url.service';
import { PruneBackupsService } from './prune-backups/prune-backups.service';
import { PgRestoreService } from './restore/pg-restore.service';
import { LocalDatabaseWipeService } from './restore-backup/local-database-wipe.service';
import { RestoreBackupService } from './restore-backup/restore-backup.service';
import { BackupInspectionService } from './restore-production/backup-inspection.service';
import { ProductionRestoreService } from './restore-production/production-restore.service';
import { RestoreProductionService } from './restore-production/restore-production.service';
import { RestoreProductionArgsService } from './restore-production/restore-production-args.service';
import { RetentionService } from './retention/retention.service';
import { BackupStorageService } from './storage/backup-storage.service';
import { S3ClientFactoryService } from './storage/s3-client-factory.service';
import { TempDirService } from './temp-dir/temp-dir.service';
import { BackupChecksService } from './verify-backup/backup-checks.service';
import { RestoredDatabaseQueryService } from './verify-backup/restored-database-query.service';
import { VerifyBackupService } from './verify-backup/verify-backup.service';

describe('AppModule', () => {
  it('wires every backup-cli service with its dependencies resolved', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      // Keep the test hermetic: never read a developer's real config file
      // or this process's environment.
      .overrideProvider(BACKUP_CONFIG_PATH)
      .useValue(join(tmpdir(), 'backup-cli-config-that-does-not-exist.json5'))
      .overrideProvider(BACKUP_ENV)
      .useValue({})
      .compile();

    for (const service of [
      ProcessRunnerService,
      BackupConfigService,
      S3ClientFactoryService,
      BackupStorageService,
      DatabaseUrlRedactorService,
      LocalDatabaseGuardService,
      TempDirService,
      PgDumpService,
      RetentionService,
      CreateBackupService,
      PruneBackupsService,
      BackupFreshnessService,
      CheckFreshnessService,
      DownloadBackupService,
      PgClientService,
      LocalMigrationsService,
      BackupChecksService,
      RestoredDatabaseQueryService,
      PgRestoreService,
      LocalDatabaseWipeService,
      VerifyBackupService,
      RestoreBackupService,
      ProductionDatabaseUrlService,
      ArchiveParserService,
      PgArchiveService,
      ProductionRestoreService,
      BackupInspectionService,
      RestoreProductionService,
      RestoreProductionArgsService,
    ]) {
      expect(moduleRef.get(service)).toBeInstanceOf(service);
    }
  });
});
