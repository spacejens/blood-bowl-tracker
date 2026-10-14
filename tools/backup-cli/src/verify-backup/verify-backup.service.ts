import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Injectable } from '@nestjs/common';

import { DownloadBackupService } from '../download-backup/download-backup.service';
import { LocalMigrationsService } from '../migrations/local-migrations.service';
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

/** `URL.hostname` keeps the brackets around an IPv6 address. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * `verify`: download a backup, restore it into an empty local database, and
 * sanity-check what came back. The target must be on this machine, with no
 * override, so a mistyped URL can never restore over a real database. The
 * temporary directory is removed whether the run succeeds or fails.
 */
@Injectable()
export class VerifyBackupService {
  constructor(
    private readonly download: DownloadBackupService,
    private readonly pgRestore: PgRestoreService,
    private readonly query: RestoredDatabaseQueryService,
    private readonly localMigrations: LocalMigrationsService,
    private readonly checks: BackupChecksService,
  ) {}

  async run(request: VerifyBackupRequest): Promise<VerifyBackupResult> {
    const databaseUrl = request.targetDatabaseUrl;
    this.assertLocalTarget(databaseUrl);
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

  /**
   * Refuses anything but a postgres URL naming only this machine. libpq's
   * `host`/`hostaddr` query parameters override the URL's host, so their
   * presence is refused too. Messages never echo the URL.
   */
  private assertLocalTarget(databaseUrl: string): void {
    const url = URL.canParse(databaseUrl) ? new URL(databaseUrl) : undefined;
    if (url === undefined || !/^postgres(ql)?:$/.test(url.protocol)) {
      throw new Error(
        'The target database must be a postgres:// or postgresql:// connection string.',
      );
    }
    if (
      !LOCAL_HOSTS.has(url.hostname) ||
      url.searchParams.has('host') ||
      url.searchParams.has('hostaddr')
    ) {
      throw new Error(
        'Refusing to restore into a non-local database: the target host must be localhost, 127.0.0.1 or ::1.',
      );
    }
  }
}
