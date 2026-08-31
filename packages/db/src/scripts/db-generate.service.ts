import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { Injectable } from '@nestjs/common';

interface SnapshotTableEntry {
  entityType: string;
  schema?: string;
  name: string;
}

@Injectable()
export class DbGenerateService {
  private listMigrationFolders(dir: string): string[] {
    if (!existsSync(dir)) return [];
    return readdirSync(dir).sort();
  }

  private readSnapshotTables(folder: string): Set<string> {
    const path = join(folder, 'snapshot.json');
    if (!existsSync(path)) return new Set();
    const snapshot = JSON.parse(readFileSync(path, 'utf-8')) as {
      ddl: SnapshotTableEntry[];
    };
    const tables = new Set<string>();
    for (const entry of snapshot.ddl) {
      if (entry.entityType === 'tables') {
        tables.add(`${entry.schema}.${entry.name}`);
      }
    }
    return tables;
  }

  findNewHistoryTables(
    previousFolder: string | undefined,
    newFolder: string,
  ): string[] {
    const previousTables = previousFolder
      ? this.readSnapshotTables(previousFolder)
      : new Set<string>();
    const newTables = this.readSnapshotTables(newFolder);
    const added: string[] = [];
    for (const table of newTables) {
      if (!previousTables.has(table) && table.endsWith('_history')) {
        added.push(table);
      }
    }
    return added;
  }

  buildTriggerSql(schemaName: string, tableName: string): string {
    const trackedTable = `"${schemaName}"."${tableName}"`;
    const historyRelation = `${schemaName}.${tableName}_history`;
    // Trigger names are unprefixed, so Postgres's alphabetical same-timing
    // firing order runs <table>_set_updated_at before <table>_versioning
    // ('s' < 'v'). This order is required, not incidental: set_updated_at
    // fires first, while NEW still equals OLD in every column (nothing else
    // has touched the row yet), so its own no-op check is a true "did
    // anything change" comparison — it bumps updated_at only on a real
    // change. versioning() then runs second and sees the row exactly as it
    // will be written (with updated_at already bumped for a real change, or
    // untouched for a no-op), so its built-in no-op guard and its history
    // INSERT (which uses NEW) both see accurate data. Reversing this order
    // was tried and rejected: versioning's history INSERT would then capture
    // NEW before set_updated_at's bump, writing a stale updated_at into the
    // new history row. See docs/architecture.md "History tracking".
    return [
      `DROP TRIGGER IF EXISTS ${tableName}_versioning ON ${trackedTable};`,
      `CREATE TRIGGER ${tableName}_versioning\n  BEFORE INSERT OR UPDATE OR DELETE ON ${trackedTable}\n  FOR EACH ROW EXECUTE PROCEDURE versioning(\n    'history_period', '${historyRelation}',\n    true, true, true, false, true, 'history_version'\n  );`,
      `DROP TRIGGER IF EXISTS ${tableName}_set_updated_at ON ${trackedTable};`,
      `CREATE TRIGGER ${tableName}_set_updated_at\n  BEFORE UPDATE ON ${trackedTable}\n  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();`,
    ].join('\n--> statement-breakpoint\n');
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Builds the PK and self-referencing FK for a new history table created via
   * LIKE (which copies neither). The FK is DEFERRABLE INITIALLY DEFERRED from
   * the start so the versioning() BEFORE-INSERT trigger can write the history
   * row before the tracked row exists at statement time; the check runs at
   * commit. Constraint names are chosen here, not parsed from drizzle-kit SQL.
   */
  buildNewHistoryTableConstraintsSql(
    schemaName: string,
    tableName: string,
  ): string {
    const historyTableName = `${tableName}_history`;
    const history = `"${schemaName}"."${historyTableName}"`;
    const tracked = `"${schemaName}"."${tableName}"`;
    return [
      `ALTER TABLE ${history} ADD CONSTRAINT "${historyTableName}_pkey" PRIMARY KEY ("id", "history_version");`,
      `ALTER TABLE ${history} ADD CONSTRAINT "${historyTableName}_id_fkey" FOREIGN KEY ("id") REFERENCES ${tracked}("id") DEFERRABLE INITIALLY DEFERRED;`,
    ].join('\n--> statement-breakpoint\n');
  }

  /**
   * Appends additional migration `statements` to `sql`, separated by exactly
   * one `--> statement-breakpoint` marker. Some upstream rewrites (e.g.
   * rewriteNewHistoryTableCreate removing a trailing FK statement) can leave
   * `sql` ending with a dangling breakpoint marker that has no following
   * statement; naively prepending another breakpoint would then produce two
   * markers with a blank line between them (an empty SQL statement). This
   * trims any such dangling trailing marker (and surrounding whitespace)
   * before appending, so the boundary always has exactly one breakpoint. When
   * `statements` is empty, `sql` is returned unchanged.
   */
  appendMigrationStatements(sql: string, statements: string): string {
    if (statements.length === 0) return sql;

    const trimmed = sql.replace(/(?:--> statement-breakpoint\s*)+$/, '');
    const base = trimmed.endsWith('\n') ? trimmed.slice(0, -1) : trimmed;
    return `${base}\n--> statement-breakpoint\n${statements}\n`;
  }

  hasMigrationName(args: string[]): boolean {
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === '--name') {
        const value = args[i + 1];
        return (
          value !== undefined && !value.startsWith('--') && value.trim() !== ''
        );
      }
      if (arg.startsWith('--name=')) {
        return arg.slice('--name='.length).trim() !== '';
      }
    }
    return false;
  }

  /**
   * A history table keeps columns that no longer exist on its tracked table,
   * made nullable, so old history rows survive. Because the TS schema now
   * mirrors only current columns, drizzle-kit emits a DROP COLUMN for the
   * history table when a tracked column is removed; we rewrite that to a
   * DROP NOT NULL so the column physically survives (nullable) instead. This
   * is unconditional: DROP NOT NULL is a safe no-op if already nullable.
   */
  rewriteHistoryDropColumns(migrationSql: string): string {
    const pattern =
      /ALTER TABLE ("[^"]+"\."[^"]+_history") DROP COLUMN ("[^"]+");/g;
    return migrationSql.replace(
      pattern,
      (_match, table, column) =>
        `ALTER TABLE ${table} ALTER COLUMN ${column} DROP NOT NULL;`,
    );
  }

  /**
   * A history table must never gain a NOT NULL constraint: history rows are
   * immutable snapshots, and a row written before a column was tightened can
   * never be backfilled, so applying the tracked table's new NOT NULL to its
   * history counterpart would abort the migration against any non-empty
   * database. drizzle-kit mirrors a tracked column's `notNull` onto the
   * history table anyway (historyTrackedTable() in
   * packages/db/src/schema/history.ts keeps the TS schema, and therefore
   * snapshot.json, saying the history column is NOT NULL — that's intentional,
   * see that file's comment), so this removes the resulting `ALTER TABLE
   * ..._history ALTER COLUMN ... SET NOT NULL;` statement entirely from the
   * generated SQL rather than rewriting it to something else. Unlike
   * rewriteHistoryDropColumns, this deletes a whole statement, so it also has
   * to consume exactly one adjacent `--> statement-breakpoint` marker to avoid
   * leaving a dangling or doubled breakpoint behind — this works by splitting
   * the SQL on the breakpoint marker, dropping any statement that matches, and
   * rejoining, which naturally collapses the separator count to match the
   * remaining statements.
   */
  rewriteHistorySetNotNull(migrationSql: string): string {
    const separator = '--> statement-breakpoint\n';
    const statementPattern =
      /^ALTER TABLE "[^"]+"\."[^"]+_history" ALTER COLUMN "[^"]+" SET NOT NULL;$/;
    const statements = migrationSql
      .split(separator)
      .filter((statement) => !statementPattern.test(statement.trim()));
    return statements.join(separator);
  }

  /**
   * A brand-new column added to a history table must never carry NOT NULL:
   * `historyTrackedTable()` mirrors a tracked column's `notNull` onto its
   * history counterpart's TS shape (see packages/db/src/schema/history.ts),
   * but never mirrors a `default`, so drizzle-kit emits a bare `ADD COLUMN
   * ... NOT NULL` for the history side with no default to fall back on —
   * this fails outright against a non-empty history table (history rows are
   * immutable snapshots; a row written before the column existed can never
   * be backfilled). Unlike rewriteHistorySetNotNull (which drops a whole
   * statement), this only strips the trailing ` NOT NULL`, keeping the ADD
   * COLUMN itself so the column still exists on the history table too.
   */
  rewriteHistoryAddNotNullColumn(migrationSql: string): string {
    const pattern =
      /(ALTER TABLE "[^"]+"\."[^"]+_history" ADD COLUMN "[^"]+" [^;]+?) NOT NULL;/g;
    return migrationSql.replace(pattern, '$1;');
  }

  /**
   * Rewrites the freshly generated SQL for a brand-new history table:
   *  - Replaces drizzle-kit's explicit `CREATE TABLE ..._history ( ... );`
   *    (columns + inline PK) with `CREATE TABLE ..._history (LIKE "s"."t");`.
   *    Postgres's default LIKE copies column names/types/NOT NULL but not the
   *    tracked table's PK, FKs, defaults, or identity/sequence generation.
   *  - Removes drizzle-kit's own self-referencing FK statement (its name is
   *    hashed for long table names), so the deferrable FK can be re-added with
   *    a name this code chooses. Consumes one adjacent statement-breakpoint.
   * The PK and deferrable FK are re-added by buildNewHistoryTableConstraintsSql.
   */
  rewriteNewHistoryTableCreate(
    migrationSql: string,
    schemaName: string,
    tableName: string,
  ): string {
    const historyTableName = `${tableName}_history`;
    const s = this.escapeRegExp(schemaName);
    const h = this.escapeRegExp(historyTableName);
    const t = this.escapeRegExp(tableName);

    const createPattern = new RegExp(
      `CREATE TABLE "${s}"\\."${h}" \\([\\s\\S]*?\\n\\);`,
    );
    const withLike = migrationSql.replace(
      createPattern,
      `CREATE TABLE "${schemaName}"."${historyTableName}" (LIKE "${schemaName}"."${tableName}");`,
    );

    const fkPattern = new RegExp(
      `ALTER TABLE "${s}"\\."${h}" ADD CONSTRAINT "[^"]+" FOREIGN KEY \\("id"\\) REFERENCES "${s}"\\."${t}"\\("id"\\)[^;]*;(--> statement-breakpoint\\n)?`,
    );
    return withLike.replace(fkPattern, '');
  }

  generate(args: string[], packageRoot: string): void {
    if (!this.hasMigrationName(args)) {
      console.error(
        'db:generate requires a descriptive migration name.\n' +
          'Pass one with --name, e.g.: pnpm db:generate --name add_players_table',
      );
      process.exit(1);
    }

    const migrationsDir = join(packageRoot, 'migrations');
    const before = new Set(this.listMigrationFolders(migrationsDir));

    execFileSync('drizzle-kit', ['generate', ...args], {
      cwd: packageRoot,
      stdio: 'inherit',
    });

    const after = this.listMigrationFolders(migrationsDir);
    const newFolders = after.filter((folder) => !before.has(folder));
    if (newFolders.length === 0) return;

    for (const newFolder of newFolders) {
      const index = after.indexOf(newFolder);
      const previousFolder =
        index > 0 ? join(migrationsDir, after[index - 1]) : undefined;
      const newFolderPath = join(migrationsDir, newFolder);
      const newHistoryTables = this.findNewHistoryTables(
        previousFolder,
        newFolderPath,
      );

      const migrationPath = join(newFolderPath, 'migration.sql');
      const originalSql = readFileSync(migrationPath, 'utf-8');

      // Dropped tracked columns become DROP NOT NULL on the history table so
      // old history rows survive. Applies to every migration, not only ones
      // that also create a new history table.
      let sql = this.rewriteHistoryDropColumns(originalSql);
      // A tracked column tightened to NOT NULL must never tighten its history
      // counterpart the same way: pre-existing history rows can never be
      // backfilled. Applies to every migration, unconditionally.
      sql = this.rewriteHistorySetNotNull(sql);
      // Same reasoning for a brand-new NOT NULL column: its history
      // counterpart must stay nullable so existing history rows survive.
      // Applies to every migration, unconditionally.
      sql = this.rewriteHistoryAddNotNullColumn(sql);

      for (const qualified of newHistoryTables) {
        const [schemaName, historyTableName] = qualified.split('.');
        const tableName = historyTableName.replace(/_history$/, '');
        sql = this.rewriteNewHistoryTableCreate(sql, schemaName, tableName);
      }

      const appended = newHistoryTables
        .map((qualified) => {
          const [schemaName, historyTableName] = qualified.split('.');
          const tableName = historyTableName.replace(/_history$/, '');
          return [
            this.buildNewHistoryTableConstraintsSql(schemaName, tableName),
            this.buildTriggerSql(schemaName, tableName),
          ].join('\n--> statement-breakpoint\n');
        })
        .join('\n--> statement-breakpoint\n');

      sql = this.appendMigrationStatements(sql, appended);

      if (sql !== originalSql) {
        writeFileSync(migrationPath, sql);
      }

      if (newHistoryTables.length > 0) {
        console.log(
          `Rewrote history-table DDL (LIKE + PK/FK + triggers) for: ${newHistoryTables.join(', ')}`,
        );
      }
    }
  }
}
