import { CliSharedModule } from '@blood-bowl-tracker/cli-shared';
import { Module } from '@nestjs/common';

import {
  BACKUP_CONFIG_PATH,
  BACKUP_ENV,
  BackupConfigService,
  DEFAULT_BACKUP_CONFIG_PATH,
} from './config/backup-config.service';
import { CreateBackupService } from './create-backup/create-backup.service';
import { DownloadBackupService } from './download-backup/download-backup.service';
import { PgDumpService } from './dump/pg-dump.service';
import { PruneBackupsService } from './prune-backups/prune-backups.service';
import { RetentionService } from './retention/retention.service';
import { BackupStorageService } from './storage/backup-storage.service';
import { S3ClientFactoryService } from './storage/s3-client-factory.service';

@Module({
  imports: [CliSharedModule],
  providers: [
    { provide: BACKUP_CONFIG_PATH, useValue: DEFAULT_BACKUP_CONFIG_PATH },
    { provide: BACKUP_ENV, useValue: process.env },
    BackupConfigService,
    S3ClientFactoryService,
    BackupStorageService,
    PgDumpService,
    RetentionService,
    CreateBackupService,
    PruneBackupsService,
    DownloadBackupService,
  ],
})
export class AppModule {}
