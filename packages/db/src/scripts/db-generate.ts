import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(currentDir, '../..');
const migrationsDir = join(packageRoot, 'migrations');

interface SnapshotTableEntry {
  entityType: string;
  schema?: string;
  name: string;
}

function listMigrationFolders(dir: string = migrationsDir): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).sort();
}

function readSnapshotTables(folder: string): Set<string> {
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

export function findNewHistoryTables(
  previousFolder: string | undefined,
  newFolder: string,
): string[] {
  const previousTables = previousFolder
    ? readSnapshotTables(previousFolder)
    : new Set<string>();
  const newTables = readSnapshotTables(newFolder);
  const added: string[] = [];
  for (const table of newTables) {
    if (!previousTables.has(table) && table.endsWith('_history')) {
      added.push(table);
    }
  }
  return added;
}

export function buildTriggerSql(schemaName: string, tableName: string): string {
  const trackedTable = `"${schemaName}"."${tableName}"`;
  const historyRelation = `${schemaName}.${tableName}_history`;
  // The versioning trigger's name is prefixed with `0_` so it sorts
  // alphabetically ahead of `<table>_set_updated_at`; Postgres fires
  // same-timing triggers in trigger-name order (the unprefixed names would
  // otherwise put set_updated_at first, since 's' < 'v'). Firing versioning
  // first lets its own built-in no-op guard (`IF NEW IS NOT DISTINCT FROM
  // OLD THEN RETURN OLD`) see NEW before set_updated_at has mutated
  // NEW.updated_at, so a genuine no-op update writes no history row.
  // set_updated_at() is itself conditional (skips the updated_at bump when
  // NEW already equals OLD), so by the time it runs on an unchanged row
  // versioning has already collapsed NEW back to OLD and it correctly does
  // nothing. Neither trigger ever returns NULL, so UPDATE ... RETURNING
  // still returns the row for a no-op update. A leading digit means the
  // name must be double-quoted. See docs/architecture.md "History tracking".
  const versioningTrigger = `"0_${tableName}_versioning"`;
  return [
    `DROP TRIGGER IF EXISTS ${versioningTrigger} ON ${trackedTable};`,
    `CREATE TRIGGER ${versioningTrigger}\n  BEFORE INSERT OR UPDATE OR DELETE ON ${trackedTable}\n  FOR EACH ROW EXECUTE PROCEDURE versioning(\n    'history_period', '${historyRelation}',\n    true, true, true, false, true, 'history_version'\n  );`,
    `DROP TRIGGER IF EXISTS ${tableName}_set_updated_at ON ${trackedTable};`,
    `CREATE TRIGGER ${tableName}_set_updated_at\n  BEFORE UPDATE ON ${trackedTable}\n  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();`,
  ].join('\n--> statement-breakpoint\n');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds the PK and self-referencing FK for a new history table created via
 * LIKE (which copies neither). The FK is DEFERRABLE INITIALLY DEFERRED from
 * the start so the versioning() BEFORE-INSERT trigger can write the history
 * row before the tracked row exists at statement time; the check runs at
 * commit. Constraint names are chosen here, not parsed from drizzle-kit SQL.
 */
export function buildNewHistoryTableConstraintsSql(
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
export function appendMigrationStatements(
  sql: string,
  statements: string,
): string {
  if (statements.length === 0) return sql;

  const trimmed = sql.replace(/(?:--> statement-breakpoint\s*)+$/, '');
  const base = trimmed.endsWith('\n') ? trimmed.slice(0, -1) : trimmed;
  return `${base}\n--> statement-breakpoint\n${statements}\n`;
}

export function hasMigrationName(args: string[]): boolean {
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
export function rewriteHistoryDropColumns(migrationSql: string): string {
  const pattern =
    /ALTER TABLE ("[^"]+"\."[^"]+_history") DROP COLUMN ("[^"]+");/g;
  return migrationSql.replace(
    pattern,
    (_match, table, column) =>
      `ALTER TABLE ${table} ALTER COLUMN ${column} DROP NOT NULL;`,
  );
}

/**
 * Rewrites the freshly generated SQL for a brand-new history table:
 *  - Replaces drizzle-kit's explicit `CREATE TABLE ..._history ( ... );`
 *    (columns + inline PK) with `CREATE TABLE ..._history (LIKE "s"."t");`.
 *    Postgres's default LIKE copies column names/types/NOT NULL but not the
 *    tracked table's PK, FKs, defaults, or identity/sequence generation.
 *  - Removes drizzle-kit's own self-referencing FK statement (its name is
 *    hashed for long table names), so Task-5 can re-add it deferrable with
 *    a name this code chooses. Consumes one adjacent statement-breakpoint.
 * The PK and deferrable FK are re-added by buildNewHistoryTableConstraintsSql.
 */
export function rewriteNewHistoryTableCreate(
  migrationSql: string,
  schemaName: string,
  tableName: string,
): string {
  const historyTableName = `${tableName}_history`;
  const s = escapeRegExp(schemaName);
  const h = escapeRegExp(historyTableName);
  const t = escapeRegExp(tableName);

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

function main() {
  const passthroughArgs = process.argv.slice(2);
  if (!hasMigrationName(passthroughArgs)) {
    console.error(
      'db:generate requires a descriptive migration name.\n' +
        'Pass one with --name, e.g.: pnpm db:generate --name add_players_table',
    );
    process.exit(1);
  }

  const before = new Set(listMigrationFolders());

  execFileSync('drizzle-kit', ['generate', ...passthroughArgs], {
    cwd: packageRoot,
    stdio: 'inherit',
  });

  const after = listMigrationFolders();
  const newFolders = after.filter((folder) => !before.has(folder));
  if (newFolders.length === 0) return;

  for (const newFolder of newFolders) {
    const index = after.indexOf(newFolder);
    const previousFolder =
      index > 0 ? join(migrationsDir, after[index - 1]) : undefined;
    const newFolderPath = join(migrationsDir, newFolder);
    const newHistoryTables = findNewHistoryTables(
      previousFolder,
      newFolderPath,
    );

    const migrationPath = join(newFolderPath, 'migration.sql');
    const originalSql = readFileSync(migrationPath, 'utf-8');

    // Dropped tracked columns become DROP NOT NULL on the history table so
    // old history rows survive. Applies to every migration, not only ones
    // that also create a new history table.
    let sql = rewriteHistoryDropColumns(originalSql);

    for (const qualified of newHistoryTables) {
      const [schemaName, historyTableName] = qualified.split('.');
      const tableName = historyTableName.replace(/_history$/, '');
      sql = rewriteNewHistoryTableCreate(sql, schemaName, tableName);
    }

    const appended = newHistoryTables
      .map((qualified) => {
        const [schemaName, historyTableName] = qualified.split('.');
        const tableName = historyTableName.replace(/_history$/, '');
        return [
          buildNewHistoryTableConstraintsSql(schemaName, tableName),
          buildTriggerSql(schemaName, tableName),
        ].join('\n--> statement-breakpoint\n');
      })
      .join('\n--> statement-breakpoint\n');

    sql = appendMigrationStatements(sql, appended);

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

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main();
}
