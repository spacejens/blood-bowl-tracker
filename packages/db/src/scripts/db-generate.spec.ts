import { describe, expect, it, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildTriggerSql, findNewHistoryTables } from './db-generate';

describe('buildTriggerSql', () => {
  it('builds DROP+CREATE statements for both the versioning and set_updated_at triggers', () => {
    const result = buildTriggerSql('game_data', 'coaches');
    expect(result).toContain(
      'DROP TRIGGER IF EXISTS coaches_versioning ON "game_data"."coaches";',
    );
    expect(result).toContain('CREATE TRIGGER coaches_versioning');
    expect(result).toContain("'history_period', 'game_data.coaches_history'");
    expect(result).toContain(
      "true, true, true, false, true, 'history_version'",
    );
    expect(result).toContain(
      'DROP TRIGGER IF EXISTS coaches_set_updated_at ON "game_data"."coaches";',
    );
    expect(result).toContain('CREATE TRIGGER coaches_set_updated_at');
    expect(result).toContain('EXECUTE PROCEDURE set_updated_at();');
    expect(result).toContain('--> statement-breakpoint');
  });
});

describe('findNewHistoryTables', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function writeSnapshot(
    folder: string,
    tables: Array<{ schema: string; name: string }>,
  ) {
    mkdirSync(folder, { recursive: true });
    writeFileSync(
      join(folder, 'snapshot.json'),
      JSON.stringify({
        ddl: tables.map((t) => ({
          entityType: 'tables',
          schema: t.schema,
          name: t.name,
        })),
      }),
    );
  }

  it('returns history tables present in the new snapshot but not the previous one', () => {
    dir = mkdtempSync(join(tmpdir(), 'db-generate-'));
    const previous = join(dir, '20260101000000_previous');
    const next = join(dir, '20260102000000_next');
    writeSnapshot(previous, [{ schema: 'game_data', name: 'coaches' }]);
    writeSnapshot(next, [
      { schema: 'game_data', name: 'coaches' },
      { schema: 'game_data', name: 'coaches_history' },
      { schema: 'game_data', name: 'races' },
    ]);

    expect(findNewHistoryTables(previous, next)).toEqual([
      'game_data.coaches_history',
    ]);
  });

  it('returns an empty array when there is no previous snapshot and treats all history tables as new', () => {
    dir = mkdtempSync(join(tmpdir(), 'db-generate-'));
    const next = join(dir, '20260101000000_first');
    writeSnapshot(next, [
      { schema: 'game_data', name: 'coaches' },
      { schema: 'game_data', name: 'coaches_history' },
    ]);

    expect(findNewHistoryTables(undefined, next)).toEqual([
      'game_data.coaches_history',
    ]);
  });

  it('ignores non-history tables that are new', () => {
    dir = mkdtempSync(join(tmpdir(), 'db-generate-'));
    const previous = join(dir, '20260101000000_previous');
    const next = join(dir, '20260102000000_next');
    writeSnapshot(previous, []);
    writeSnapshot(next, [{ schema: 'game_data', name: 'races' }]);

    expect(findNewHistoryTables(previous, next)).toEqual([]);
  });
});
