import { CliSharedModule } from '@blood-bowl-tracker/cli-shared';
import { Module } from '@nestjs/common';

import { ArchiveParserService } from './archive/archive-parser.service';
import { PgArchiveService } from './archive/pg-archive.service';
import {
  BACKUP_CONFIG_PATH,
  BACKUP_ENV,
  BackupConfigService,
  DEFAULT_BACKUP_CONFIG_PATH,
} from './config/backup-config.service';
import { CreateBackupService } from './create-backup/create-backup.service';
import { DownloadBackupService } from './download-backup/download-backup.service';
import { PgDumpService } from './dump/pg-dump.service';
import {
  DEFAULT_MIGRATIONS_DIR,
  LocalMigrationsService,
  MIGRATIONS_DIR,
} from './migrations/local-migrations.service';
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

@Module({
  imports: [CliSharedModule],
  providers: [
    { provide: BACKUP_CONFIG_PATH, useValue: DEFAULT_BACKUP_CONFIG_PATH },
    { provide: BACKUP_ENV, useValue: process.env },
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
    DownloadBackupService,
    { provide: MIGRATIONS_DIR, useValue: DEFAULT_MIGRATIONS_DIR },
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
  ],
})
export class AppModule {}
