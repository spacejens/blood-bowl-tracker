import { Injectable } from '@nestjs/common';

import { KEY_TABLES } from './key-tables';

export interface MigrationCheckInput {
  /** Migration names recorded in the restored backup. */
  readonly restored: readonly string[];
  /** The checkout's migration folder names, sorted oldest first. */
  readonly local: readonly string[];
}

/** Row count per key table name, as read from the restored backup. */
export type TableRowCounts = Readonly<Record<string, number>>;

/**
 * The pass/fail decisions of backup verification. Each check returns every
 * problem it finds as a message, so one run reports all of them; an empty
 * list means the check passed.
 */
@Injectable()
export class BackupChecksService {
  /**
   * The backup must record exactly the oldest N of the checkout's
   * migrations: a backup older than the checkout is fine, but one recording
   * a migration the checkout lacks, or skipping one, is not.
   */
  checkMigrations(input: MigrationCheckInput): string[] {
    const { restored, local } = input;
    if (restored.length === 0) {
      return ['The backup records no applied migrations.'];
    }
    const failures: string[] = [];
    const localNames = new Set(local);
    const unknown = restored.filter((name) => !localNames.has(name));
    if (unknown.length > 0) {
      failures.push(
        `The backup records migrations absent from packages/db/migrations: ${unknown.join(', ')}.`,
      );
    }
    const duplicates = [
      ...new Set(restored.filter((name, i) => restored.indexOf(name) !== i)),
    ];
    if (duplicates.length > 0) {
      failures.push(
        `The backup records a migration more than once: ${duplicates.join(', ')}.`,
      );
    }
    const restoredNames = new Set(restored);
    // -1 when every recorded name is unknown, which is reported above.
    const newestIndex = Math.max(
      ...restored.map((name) => local.indexOf(name)),
    );
    const skipped = local
      .slice(0, newestIndex + 1)
      .filter((name) => !restoredNames.has(name));
    if (skipped.length > 0) {
      failures.push(
        `The backup skips migrations older than its newest one: ${skipped.join(', ')}.`,
      );
    }
    return failures;
  }

  /** Every key table must have at least one row. */
  checkTableRowCounts(counts: TableRowCounts): string[] {
    return KEY_TABLES.filter((table) => (counts[table] ?? 0) < 1).map(
      (table) => `game_data.${table} has no rows.`,
    );
  }
}
