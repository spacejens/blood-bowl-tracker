import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
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

interface SnapshotColumnEntry {
  entityType: string;
  schema?: string;
  table?: string;
  name: string;
  type?: string;
}

interface ColumnTypeMap {
  [key: string]: string;
}

function readSnapshotColumnTypes(folder: string): ColumnTypeMap {
  const path = join(folder, 'snapshot.json');
  if (!existsSync(path)) return {};
  const snapshot = JSON.parse(readFileSync(path, 'utf-8')) as {
    ddl: SnapshotColumnEntry[];
  };
  const types: ColumnTypeMap = {};
  for (const entry of snapshot.ddl) {
    if (entry.entityType === 'columns' && entry.type !== undefined) {
      types[`${entry.schema}.${entry.table}.${entry.name}`] = entry.type;
    }
  }
  return types;
}

export interface TypeConflict {
  schema: string;
  table: string;
  column: string;
  previousType: string;
  currentType: string;
}

export function findTypeConflicts(
  previousFolder: string | undefined,
  newFolder: string,
): TypeConflict[] {
  if (!previousFolder) return [];

  const previousTypes = readSnapshotColumnTypes(previousFolder);
  const currentTypes = readSnapshotColumnTypes(newFolder);

  const conflicts: TypeConflict[] = [];
  for (const [key, previousType] of Object.entries(previousTypes)) {
    const currentType = currentTypes[key];
    if (currentType === undefined || currentType === previousType) continue;

    const [schema, table, column] = key.split('.');
    if (table.endsWith('_history')) continue;

    const historyType = currentTypes[`${schema}.${table}_history.${column}`];
    if (historyType === previousType) {
      conflicts.push({ schema, table, column, previousType, currentType });
    }
  }
  return conflicts;
}

export function buildTypeConflictComment(conflict: TypeConflict): string {
  return (
    `-- NOTE: ${conflict.table}.${conflict.column} changed type from ` +
    `${conflict.previousType} to ${conflict.currentType} on the tracked ` +
    `table; ${conflict.table}_history.${conflict.column} was intentionally ` +
    `left as ${conflict.previousType} to preserve existing history rows — ` +
    `review manually.`
  );
}

export function buildTriggerSql(schemaName: string, tableName: string): string {
  const trackedTable = `"${schemaName}"."${tableName}"`;
  const historyRelation = `${schemaName}.${tableName}_history`;
  return [
    `DROP TRIGGER IF EXISTS ${tableName}_versioning ON ${trackedTable};`,
    `CREATE TRIGGER ${tableName}_versioning\n  BEFORE INSERT OR UPDATE OR DELETE ON ${trackedTable}\n  FOR EACH ROW EXECUTE PROCEDURE versioning(\n    'history_period', '${historyRelation}',\n    true, true, true, false, true, 'history_version'\n  );`,
    `DROP TRIGGER IF EXISTS ${tableName}_set_updated_at ON ${trackedTable};`,
    `CREATE TRIGGER ${tableName}_set_updated_at\n  BEFORE UPDATE ON ${trackedTable}\n  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();`,
  ].join('\n--> statement-breakpoint\n');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The self-referencing FK's constraint name is normally
 * `${tableName}_history_id_${tableName}_id_fkey`, but drizzle-kit hashes it
 * (e.g. `..._Fg5zBqg3fABa_fkey`) whenever that name would exceed Postgres's
 * 63-byte identifier limit — which happens for any tracked table name of
 * 22+ characters. Reconstructing the name would silently break for exactly
 * those tables, so this parses the name drizzle-kit actually generated out
 * of the migration SQL instead of guessing it.
 */
export function findHistorySelfFkConstraintName(
  migrationSql: string,
  schemaName: string,
  tableName: string,
): string {
  const historyTableName = `${tableName}_history`;
  const pattern = new RegExp(
    `ALTER TABLE "${escapeRegExp(schemaName)}"\\."${escapeRegExp(historyTableName)}" ADD CONSTRAINT "([^"]+)" FOREIGN KEY \\("id"\\) REFERENCES "${escapeRegExp(schemaName)}"\\."${escapeRegExp(tableName)}"\\("id"\\)`,
  );
  const match = migrationSql.match(pattern);
  if (!match) {
    throw new Error(
      `Could not find self-referencing FK constraint from ${historyTableName} to ${tableName} in generated migration SQL`,
    );
  }
  return match[1];
}

/**
 * drizzle-orm has no way to declare a foreign key as DEFERRABLE INITIALLY
 * DEFERRED from the schema DSL, so every self-referencing FK from a history
 * table back to its tracked table is generated NOT DEFERRABLE by default.
 * That breaks the versioning() trigger: it's a BEFORE INSERT trigger that
 * writes the new row into the history table before the row exists in the
 * tracked table, which violates a non-deferrable FK. Making the constraint
 * deferrable defers that check to transaction commit, after both rows exist.
 */
export function buildDeferrableHistoryFkSql(
  schemaName: string,
  tableName: string,
  constraintName: string,
): string {
  const historyTableName = `${tableName}_history`;
  return `ALTER TABLE "${schemaName}"."${historyTableName}" ALTER CONSTRAINT "${constraintName}" DEFERRABLE INITIALLY DEFERRED;`;
}

function main() {
  const before = new Set(listMigrationFolders());

  execFileSync('drizzle-kit', ['generate', ...process.argv.slice(2)], {
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
    const newHistoryTables = findNewHistoryTables(
      previousFolder,
      join(migrationsDir, newFolder),
    );
    const conflicts = findTypeConflicts(
      previousFolder,
      join(migrationsDir, newFolder),
    );
    if (newHistoryTables.length === 0 && conflicts.length === 0) continue;

    const migrationPath = join(migrationsDir, newFolder, 'migration.sql');

    if (newHistoryTables.length > 0) {
      const generatedSql = readFileSync(migrationPath, 'utf-8');
      const statements = newHistoryTables
        .map((qualified) => {
          const [schemaName, historyTableName] = qualified.split('.');
          const tableName = historyTableName.replace(/_history$/, '');
          const constraintName = findHistorySelfFkConstraintName(
            generatedSql,
            schemaName,
            tableName,
          );
          return [
            buildDeferrableHistoryFkSql(schemaName, tableName, constraintName),
            buildTriggerSql(schemaName, tableName),
          ].join('\n--> statement-breakpoint\n');
        })
        .join('\n--> statement-breakpoint\n');

      appendFileSync(
        migrationPath,
        `\n--> statement-breakpoint\n${statements}\n`,
      );
      console.log(
        `Appended deferrable-FK and trigger DDL for: ${newHistoryTables.join(', ')}`,
      );
    }

    if (conflicts.length > 0) {
      const comments = conflicts.map(buildTypeConflictComment).join('\n');
      appendFileSync(migrationPath, `\n${comments}\n`);
      console.log(
        `Flagged ${conflicts.length} type conflict(s) for manual review in ${newFolder}`,
      );
    }
  }
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main();
}
