import { Injectable } from '@nestjs/common';

import { TableRowCounts } from '../verify-backup/backup-checks.service';
import { KEY_TABLES } from '../verify-backup/key-tables';

export interface BackupContents {
  /** Migration names drizzle recorded, ordered by id. */
  readonly migrations: readonly string[];
  /** Row count per key table, keyed by bare table name; 0 when absent. */
  readonly tableRowCounts: TableRowCounts;
}

/** A `pg_restore --list` schema entry: `<id>; <tableoid> <oid> SCHEMA - <name> <owner>`. */
const SCHEMA_ENTRY = /^\d+;\s+\d+\s+\d+\s+SCHEMA\s+-\s+(\S+)/;
const COPY_HEADER = /^COPY\s+(\S+)\s+\(([^)]*)\)\s+FROM\s+stdin;$/;
const END_OF_COPY = '\\.';
const NULL_VALUE = '\\N';
const MIGRATIONS_TABLE = 'drizzle.__drizzle_migrations';

interface CopyBlock {
  readonly table: string;
  readonly columns: readonly string[];
  readonly rows: string[][];
}

/**
 * Reads what `restore-production` needs to know about a backup out of
 * `pg_restore` output, without restoring it anywhere: the schemas its table
 * of contents creates, and, from a data-only script, the migrations drizzle
 * recorded and the key tables' row counts. In COPY text format every row is
 * one line (tabs and newlines inside values are escaped), and `\.` ends a
 * table's rows. Everything outside COPY blocks (SET, comments, `\restrict`)
 * is ignored.
 */
@Injectable()
export class ArchiveParserService {
  /** Schema names in a `pg_restore --list` listing, sorted. */
  schemas(listing: string): string[] {
    const names = new Set<string>();
    for (const line of listing.split('\n')) {
      const [, name] = SCHEMA_ENTRY.exec(line.trim()) ?? [];
      if (name !== undefined) {
        names.add(name);
      }
    }
    return [...names].sort();
  }

  /** Migrations and key-table row counts in a `pg_restore --data-only` script. */
  contents(dataScript: string): BackupContents {
    const counts: Record<string, number> = Object.fromEntries(
      KEY_TABLES.map((table) => [table, 0]),
    );
    let migrations: string[] = [];
    for (const block of this.copyBlocks(dataScript)) {
      if (block.table === MIGRATIONS_TABLE) {
        migrations = this.migrationNames(block);
      }
      for (const table of KEY_TABLES) {
        if (block.table === `game_data.${table}`) {
          counts[table] = block.rows.length;
        }
      }
    }
    return { migrations, tableRowCounts: counts };
  }

  private copyBlocks(script: string): CopyBlock[] {
    const blocks: CopyBlock[] = [];
    let current: CopyBlock | undefined;
    for (const line of script.split('\n')) {
      if (current === undefined) {
        const [, table, columns] = COPY_HEADER.exec(line) ?? [];
        if (table !== undefined && columns !== undefined) {
          current = {
            table: this.unquote(table),
            columns: columns.split(',').map((c) => this.unquote(c.trim())),
            rows: [],
          };
        }
        continue;
      }
      if (line === END_OF_COPY) {
        blocks.push(current);
        current = undefined;
        continue;
      }
      current.rows.push(line.split('\t'));
    }
    if (current !== undefined) {
      throw new Error(
        `The backup's data for ${current.table} ends without a COPY terminator.`,
      );
    }
    return blocks;
  }

  private migrationNames(block: CopyBlock): string[] {
    const idIndex = block.columns.indexOf('id');
    const nameIndex = block.columns.indexOf('name');
    if (idIndex < 0 || nameIndex < 0) {
      throw new Error(
        `${MIGRATIONS_TABLE} in the backup has no id or name column ` +
          `(columns: ${block.columns.join(', ')}).`,
      );
    }
    return block.rows
      .filter((row) => row[nameIndex] !== NULL_VALUE)
      .sort((a, b) => Number(a[idIndex]) - Number(b[idIndex]))
      .map((row) => row[nameIndex]);
  }

  private unquote(identifier: string): string {
    return identifier.replaceAll('"', '');
  }
}
