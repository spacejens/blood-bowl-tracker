import { join } from 'node:path';

import { Injectable } from '@nestjs/common';

import {
  ArchiveParserService,
  BackupContents,
} from '../archive/archive-parser.service';
import { PgArchiveService } from '../archive/pg-archive.service';
import { BackupChecksService } from '../verify-backup/backup-checks.service';
import { APPLICATION_SCHEMAS } from './application-schemas';

export interface BackupInspectionRequest {
  readonly dumpPath: string;
  /** The run's temporary directory, for the extracted data script. */
  readonly workDir: string;
  /** This checkout's migration folder names, oldest first. */
  readonly localMigrations: readonly string[];
}

/**
 * Decides, from the archive alone, whether a backup may be restored into
 * production: it may only create application schemas (the wipe drops
 * nothing else, so any other schema would collide or leak in; `public` is
 * never listed as a schema entry in an archive), its migrations must be the
 * oldest N of this checkout's (startup migrations then apply the rest), and
 * every key table must have rows.
 */
@Injectable()
export class BackupInspectionService {
  constructor(
    private readonly archive: PgArchiveService,
    private readonly parser: ArchiveParserService,
    private readonly checks: BackupChecksService,
  ) {}

  async inspect(request: BackupInspectionRequest): Promise<BackupContents> {
    const schemas = this.parser.schemas(
      await this.archive.listContents(request.dumpPath),
    );
    const allowed = new Set<string>(APPLICATION_SCHEMAS);
    const unexpected = schemas.filter((schema) => !allowed.has(schema));
    if (unexpected.length > 0) {
      throw new Error(
        'The backup contains schemas outside the application schemas ' +
          `(${APPLICATION_SCHEMAS.join(', ')}): ${unexpected.join(', ')}. ` +
          'Refusing to restore it into production.',
      );
    }
    const contents = this.parser.contents(
      await this.archive.extractData({
        dumpPath: request.dumpPath,
        outputPath: join(request.workDir, 'backup-data.sql'),
      }),
    );
    const failures = [
      ...this.checks.checkMigrations({
        restored: contents.migrations,
        local: request.localMigrations,
      }),
      ...this.checks.checkTableRowCounts(contents.tableRowCounts),
    ];
    if (failures.length > 0) {
      throw new Error(
        [
          'The backup is not safe to restore into production from this checkout:',
          ...failures.map((failure) => `- ${failure}`),
        ].join('\n'),
      );
    }
    return contents;
  }
}
