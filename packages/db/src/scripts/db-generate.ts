import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const packageRoot = join(__dirname, '../..');
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
  return [
    `DROP TRIGGER IF EXISTS ${tableName}_versioning ON ${trackedTable};`,
    `CREATE TRIGGER ${tableName}_versioning\n  BEFORE INSERT OR UPDATE OR DELETE ON ${trackedTable}\n  FOR EACH ROW EXECUTE PROCEDURE versioning(\n    'history_period', '${historyRelation}',\n    true, true, true, false, true, 'history_version'\n  );`,
    `DROP TRIGGER IF EXISTS ${tableName}_set_updated_at ON ${trackedTable};`,
    `CREATE TRIGGER ${tableName}_set_updated_at\n  BEFORE UPDATE ON ${trackedTable}\n  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();`,
  ].join('\n--> statement-breakpoint\n');
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
    if (newHistoryTables.length === 0) continue;

    const triggerStatements = newHistoryTables
      .map((qualified) => {
        const [schemaName, historyTableName] = qualified.split('.');
        const tableName = historyTableName.replace(/_history$/, '');
        return buildTriggerSql(schemaName, tableName);
      })
      .join('\n--> statement-breakpoint\n');

    const migrationPath = join(migrationsDir, newFolder, 'migration.sql');
    appendFileSync(
      migrationPath,
      `\n--> statement-breakpoint\n${triggerStatements}\n`,
    );
    console.log(`Appended trigger DDL for: ${newHistoryTables.join(', ')}`);
  }
}

if (require.main === module) {
  main();
}
