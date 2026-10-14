import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Injectable } from '@nestjs/common';

import { DownloadBackupService } from '../download-backup/download-backup.service';
import { LocalMigrationsService } from '../migrations/local-migrations.service';
import { LocalDatabaseGuardService } from '../pg-client/local-database-guard.service';
import { PgRestoreService } from '../restore/pg-restore.service';
import { BackupChecksService, TableRowCounts } from './backup-checks.service';
import { RestoredDatabaseQueryService } from './restored-database-query.service';

export interface VerifyBackupRequest {
  /** An empty database on this machine to restore into. */
  readonly targetDatabaseUrl: string;
  /** The backup to verify; the newest one when omitted. */
  readonly key?: string;
}

export interface VerifyBackupResult {
  readonly key: string;
  /** How many migrations the backup records as applied. */
  readonly restoredMigrations: number;
  readonly tableRowCounts: TableRowCounts;
}

/**
 * `verify`: download a backup, restore it into an empty local database, and
 * sanity-check what came back. The target must be on this machine (see
 * `LocalDatabaseGuardService`). The temporary directory is removed whether
 * the run succeeds or fails.
 */
@Injectable()
export class VerifyBackupService {
  constructor(
    private readonly guard: LocalDatabaseGuardService,
    private readonly download: DownloadBackupService,
    private readonly pgRestore: PgRestoreService,
    private readonly query: RestoredDatabaseQueryService,
    private readonly localMigrations: LocalMigrationsService,
    private readonly checks: BackupChecksService,
  ) {}

  async run(request: VerifyBackupRequest): Promise<VerifyBackupResult> {
    const databaseUrl = request.targetDatabaseUrl;
    this.guard.assertLocal(databaseUrl);
    // Read before the download so a broken checkout fails fast.
    const local = this.localMigrations.list();
    const workDir = mkdtempSync(join(tmpdir(), 'backup-cli-verify-'));
    try {
      const { key, path } = await this.download.run({
        destinationPath: join(workDir, 'backup.dump'),
        key: request.key,
      });
      await this.pgRestore.restore({ dumpPath: path, databaseUrl });
      const restored = await this.query.appliedMigrations(databaseUrl);
      const tableRowCounts = await this.query.keyTableRowCounts(databaseUrl);
      const failures = [
        ...this.checks.checkMigrations({ restored, local }),
        ...this.checks.checkTableRowCounts(tableRowCounts),
      ];
      if (failures.length > 0) {
        throw new Error(
          [
            `Backup ${key} failed verification:`,
            ...failures.map((failure) => `- ${failure}`),
          ].join('\n'),
        );
      }
      return { key, restoredMigrations: restored.length, tableRowCounts };
    } finally {
      try {
        rmSync(workDir, { recursive: true, force: true });
      } catch {
        // Cleanup is best effort; it must never mask the run's own outcome,
        // but a leftover production dump is worth surfacing.
        process.stderr.write(
          `Warning: Could not remove temporary directory ${workDir}; delete it manually.\n`,
        );
      }
    }
  }
}
