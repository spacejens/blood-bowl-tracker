import { join } from 'node:path';

import { Injectable } from '@nestjs/common';

import { BackupConfigService } from '../config/backup-config.service';
import { PgDumpService } from '../dump/pg-dump.service';
import {
  BACKUP_KEY_PREFIX,
  BACKUP_KEY_SUFFIX,
  BackupStorageService,
} from '../storage/backup-storage.service';
import { TempDirService } from '../temp-dir/temp-dir.service';

export interface CreateBackupResult {
  readonly key: string;
  readonly sizeBytes: number;
  readonly createdAt: string;
}

/**
 * `create`: dump the production database to a temporary file and upload it
 * as `production/<UTC timestamp>.dump`. Both settings are read up front so a
 * missing storage credential fails before a long dump, not after it. The
 * temporary directory is removed whether the run succeeds or fails, since
 * pg_dump can leave a partial file behind.
 */
@Injectable()
export class CreateBackupService {
  constructor(
    private readonly config: BackupConfigService,
    private readonly pgDump: PgDumpService,
    private readonly storage: BackupStorageService,
    private readonly tempDir: TempDirService,
  ) {}

  async run(): Promise<CreateBackupResult> {
    const databaseUrl = this.config.getDatabaseUrl();
    this.config.getStorageSettings();
    const createdAt = new Date().toISOString();
    // ':' is legal in an object key but not in a Windows file name, and the
    // key's last segment is the natural local file name on download.
    const key = `${BACKUP_KEY_PREFIX}${createdAt.replace(/:/g, '-')}${BACKUP_KEY_SUFFIX}`;
    return this.tempDir.run('backup-cli-', async (workDir) => {
      const outputPath = join(workDir, 'backup.dump');
      const sizeBytes = await this.pgDump.dump({ databaseUrl, outputPath });
      await this.storage.upload({ key, filePath: outputPath });
      return { key, sizeBytes, createdAt };
    });
  }
}
