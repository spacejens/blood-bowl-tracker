import { join } from 'node:path';

import { Injectable } from '@nestjs/common';

import { BackupConfigService } from '../config/backup-config.service';
import { DownloadBackupService } from '../download-backup/download-backup.service';
import { DatabaseUrlRedactorService } from '../pg-client/database-url-redactor.service';
import { LocalDatabaseGuardService } from '../pg-client/local-database-guard.service';
import { PgRestoreService } from '../restore/pg-restore.service';
import { TempDirService } from '../temp-dir/temp-dir.service';
import { TableRowCounts } from '../verify-backup/backup-checks.service';
import { RestoredDatabaseQueryService } from '../verify-backup/restored-database-query.service';
import { LocalDatabaseWipeService } from './local-database-wipe.service';

export interface RestoreBackupRequest {
  /** The backup to restore; the newest one when omitted. */
  readonly key?: string;
}

export interface RestoreBackupResult {
  readonly key: string;
  /** How many migrations the backup records as applied. */
  readonly restoredMigrations: number;
  readonly tableRowCounts: TableRowCounts;
}

/**
 * `restore`: replace the local development database (`localDatabase.url`)
 * with a backup. The backup is downloaded first, so a network or credential
 * failure never touches existing data; then the database is cleared and the
 * backup restored. Those are two transactions, so a restore failing after
 * the wipe leaves an empty database, and the error says so. Migrations newer
 * than the backup are not applied here: whatever next connects through
 * `packages/db` applies them. What came back is reported, not judged; that
 * is `verify`'s job.
 */
@Injectable()
export class RestoreBackupService {
  constructor(
    private readonly config: BackupConfigService,
    private readonly guard: LocalDatabaseGuardService,
    private readonly redactor: DatabaseUrlRedactorService,
    private readonly tempDir: TempDirService,
    private readonly download: DownloadBackupService,
    private readonly wipe: LocalDatabaseWipeService,
    private readonly pgRestore: PgRestoreService,
    private readonly query: RestoredDatabaseQueryService,
  ) {}

  async run(request: RestoreBackupRequest): Promise<RestoreBackupResult> {
    const databaseUrl = this.config.getLocalDatabaseUrl();
    this.guard.assertLocal(databaseUrl);
    const target = this.redactor.mask(databaseUrl);
    return this.tempDir.run('backup-cli-restore-', async (workDir) => {
      const { key, path } = await this.download.run({
        destinationPath: join(workDir, 'backup.dump'),
        key: request.key,
      });
      try {
        await this.wipe.wipe(databaseUrl);
      } catch (error) {
        throw new Error(
          `Could not clear ${target} before restoring; its existing data is unchanged. ` +
            this.describe(error),
          { cause: error },
        );
      }
      try {
        await this.pgRestore.restore({ dumpPath: path, databaseUrl });
      } catch (error) {
        throw new Error(
          `Restoring ${key} into ${target} failed after the database was cleared, ` +
            'so it is now empty; re-run restore to try again. ' +
            this.describe(error),
          { cause: error },
        );
      }
      const restored = await this.query.appliedMigrations(databaseUrl);
      const tableRowCounts = await this.query.keyTableRowCounts(databaseUrl);
      return { key, restoredMigrations: restored.length, tableRowCounts };
    });
  }

  /** `PgClientService` errors are already redacted, so the cause is safe to keep. */
  private describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
