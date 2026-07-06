import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ColumnShape } from './history-column-shape';

interface SnapshotDdlEntry {
  entityType: string;
  schema?: string;
  table?: string;
  name: string;
  type?: string;
  notNull?: boolean;
}

interface Snapshot {
  ddl: SnapshotDdlEntry[];
}

function latestSnapshotPath(migrationsDir: string): string | undefined {
  if (!existsSync(migrationsDir)) return undefined;
  const folders = readdirSync(migrationsDir)
    .filter((name) => existsSync(join(migrationsDir, name, 'snapshot.json')))
    .sort();
  if (folders.length === 0) return undefined;
  return join(migrationsDir, folders[folders.length - 1], 'snapshot.json');
}

export function readPreviousColumnShapes(
  migrationsDir: string,
  schemaName: string,
  tableName: string,
): ColumnShape[] {
  const path = latestSnapshotPath(migrationsDir);
  if (!path) return [];
  const snapshot = JSON.parse(readFileSync(path, 'utf-8')) as Snapshot;
  return snapshot.ddl
    .filter(
      (entry) =>
        entry.entityType === 'columns' &&
        entry.schema === schemaName &&
        entry.table === tableName,
    )
    .map((entry) => ({
      name: entry.name,
      sqlType: entry.type ?? '',
      notNull: entry.notNull ?? false,
    }));
}
