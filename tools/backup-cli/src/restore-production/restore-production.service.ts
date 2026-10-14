import { join } from 'node:path';

import { Injectable } from '@nestjs/common';

import { PgArchiveService } from '../archive/pg-archive.service';
import { DownloadBackupService } from '../download-backup/download-backup.service';
import { LocalMigrationsService } from '../migrations/local-migrations.service';
import { DatabaseUrlRedactorService } from '../pg-client/database-url-redactor.service';
import { ProductionDatabaseUrlService } from '../production-database/production-database-url.service';
import { TempDirService } from '../temp-dir/temp-dir.service';
import { TableRowCounts } from '../verify-backup/backup-checks.service';
import { RestoredDatabaseQueryService } from '../verify-backup/restored-database-query.service';
import { BackupInspectionService } from './backup-inspection.service';
import { ProductionRestoreService } from './production-restore.service';

/** The Fly app name: the phrase a real restore must be given. */
export const RESTORE_PRODUCTION_CONFIRMATION = 'blood-bowl-tracker-discord-bot';

export interface RestoreProductionRequest {
  /** The backup to restore; the newest one when omitted. */
  readonly key?: string;
  /** Inspect and report only; never writes to production. */
  readonly dryRun: boolean;
  /** Must equal `RESTORE_PRODUCTION_CONFIRMATION` for a real run. */
  readonly confirm?: string;
}

export interface RestoreProductionDryRunResult {
  readonly mode: 'dry-run';
  readonly key: string;
  readonly backup: {
    readonly migrations: number;
    readonly tableRowCounts: TableRowCounts;
  };
  readonly production: { readonly tableRowCounts: TableRowCounts };
}

export interface RestoreProductionRestoredResult {
  readonly mode: 'restored';
  readonly key: string;
  /** How many migrations the restored backup records as applied. */
  readonly restoredMigrations: number;
  readonly tableRowCounts: TableRowCounts;
  /** Production's key-table row counts just before the restore. */
  readonly previousTableRowCounts: TableRowCounts;
}

export type RestoreProductionResult =
  RestoreProductionDryRunResult | RestoreProductionRestoredResult;

interface RestoreStep {
  readonly key: string;
  readonly dumpPath: string;
  readonly workDir: string;
  readonly databaseUrl: string;
  readonly target: string;
  readonly previousTableRowCounts: TableRowCounts;
}

/**
 * `restore-production`: replace production's application schemas with a
 * backup. A real run refuses without the confirmation phrase, before reading
 * anything. The backup is downloaded and inspected first, so a storage
 * failure or an unsuitable backup never touches production; production's
 * key-table counts are then read, which also proves the connection. A dry
 * run stops there. A real run restores in one transaction (see
 * `ProductionRestoreService`) and reads back what it restored. Startup
 * migrations, not this command, apply anything newer than the backup.
 */
@Injectable()
export class RestoreProductionService {
  constructor(
    private readonly productionUrl: ProductionDatabaseUrlService,
    private readonly redactor: DatabaseUrlRedactorService,
    private readonly localMigrations: LocalMigrationsService,
    private readonly tempDir: TempDirService,
    private readonly download: DownloadBackupService,
    private readonly inspection: BackupInspectionService,
    private readonly query: RestoredDatabaseQueryService,
    private readonly archive: PgArchiveService,
    private readonly productionRestore: ProductionRestoreService,
  ) {}

  async run(
    request: RestoreProductionRequest,
  ): Promise<RestoreProductionResult> {
    if (
      !request.dryRun &&
      request.confirm !== RESTORE_PRODUCTION_CONFIRMATION
    ) {
      throw new Error(
        'Refusing to restore into production without ' +
          `--confirm ${RESTORE_PRODUCTION_CONFIRMATION}; nothing was ` +
          'downloaded or changed. Use --dry-run to rehearse.',
      );
    }
    const databaseUrl = await this.productionUrl.read();
    const target = this.redactor.mask(databaseUrl);
    // Read before the download so a broken checkout fails fast.
    const local = this.localMigrations.list();
    return this.tempDir.run(
      'backup-cli-restore-production-',
      async (workDir): Promise<RestoreProductionResult> => {
        const { key, path } = await this.download.run({
          destinationPath: join(workDir, 'backup.dump'),
          key: request.key,
        });
        const backup = await this.inspection.inspect({
          dumpPath: path,
          workDir,
          localMigrations: local,
        });
        const previousTableRowCounts = await this.readProduction(
          databaseUrl,
          target,
        );
        if (request.dryRun) {
          return {
            mode: 'dry-run',
            key,
            backup: {
              migrations: backup.migrations.length,
              tableRowCounts: backup.tableRowCounts,
            },
            production: { tableRowCounts: previousTableRowCounts },
          };
        }
        return this.restore({
          key,
          dumpPath: path,
          workDir,
          databaseUrl,
          target,
          previousTableRowCounts,
        });
      },
    );
  }

  private async readProduction(
    databaseUrl: string,
    target: string,
  ): Promise<TableRowCounts> {
    try {
      return await this.query.keyTableRowCounts(databaseUrl);
    } catch (error) {
      throw new Error(
        `Could not read ${target} before restoring; nothing was changed. ` +
          this.describe(error),
        { cause: error },
      );
    }
  }

  private async restore(
    step: RestoreStep,
  ): Promise<RestoreProductionRestoredResult> {
    const scriptPath = join(step.workDir, 'restore.sql');
    try {
      await this.archive.writeRestoreScript({
        dumpPath: step.dumpPath,
        outputPath: scriptPath,
      });
    } catch (error) {
      throw new Error(
        `Could not prepare ${step.key} for restoring; ${step.target} is unchanged. ` +
          this.describe(error),
        { cause: error },
      );
    }
    try {
      await this.productionRestore.restore({
        scriptPath,
        databaseUrl: step.databaseUrl,
      });
    } catch (error) {
      throw new Error(
        `Restoring ${step.key} into ${step.target} failed. The wipe and the restore run ` +
          'in one transaction, so production is unchanged. ' +
          this.describe(error),
        { cause: error },
      );
    }
    try {
      const restored = await this.query.appliedMigrations(step.databaseUrl);
      const tableRowCounts = await this.query.keyTableRowCounts(
        step.databaseUrl,
      );
      return {
        mode: 'restored',
        key: step.key,
        restoredMigrations: restored.length,
        tableRowCounts,
        previousTableRowCounts: step.previousTableRowCounts,
      };
    } catch (error) {
      throw new Error(
        `Restored ${step.key} into ${step.target}, but reading the restored database ` +
          'back failed: ' +
          this.describe(error),
        { cause: error },
      );
    }
  }

  /** `PgClientService` errors are already redacted, so the cause is safe to keep. */
  private describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
