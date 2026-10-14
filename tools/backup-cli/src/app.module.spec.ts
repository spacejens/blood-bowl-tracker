import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ProcessRunnerService } from '@blood-bowl-tracker/cli-shared';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { AppModule } from './app.module';
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
import { PruneBackupsService } from './prune-backups/prune-backups.service';
import { PgRestoreService } from './restore/pg-restore.service';
import { RetentionService } from './retention/retention.service';
import { BackupStorageService } from './storage/backup-storage.service';
import { S3ClientFactoryService } from './storage/s3-client-factory.service';
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
      PgDumpService,
      RetentionService,
      CreateBackupService,
      PruneBackupsService,
      DownloadBackupService,
      PgClientService,
      LocalMigrationsService,
      BackupChecksService,
      RestoredDatabaseQueryService,
      PgRestoreService,
      VerifyBackupService,
    ]) {
      expect(moduleRef.get(service)).toBeInstanceOf(service);
    }
  });
});
