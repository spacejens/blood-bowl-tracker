import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  buildDeferrableHistoryFkSql,
  buildTriggerSql,
  buildTypeConflictComment,
  findHistorySelfFkConstraintName,
  findNewHistoryTables,
  findTypeConflicts,
} from './db-generate.js';

describe('findHistorySelfFkConstraintName', () => {
  it('extracts the constraint name drizzle-kit generated for a short table name', () => {
    const sql =
      'CREATE TABLE "game_data"."coaches_history" (...);\n' +
      '--> statement-breakpoint\n' +
      'ALTER TABLE "game_data"."coaches_history" ADD CONSTRAINT "coaches_history_id_coaches_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."coaches"("id");';

    expect(findHistorySelfFkConstraintName(sql, 'game_data', 'coaches')).toBe(
      'coaches_history_id_coaches_id_fkey',
    );
  });

  it('extracts a drizzle-kit-hashed constraint name for a long table name, rather than reconstructing the naive one', () => {
    // Mirrors what drizzle-kit actually emits once the natural name would
    // exceed Postgres's 63-byte identifier limit (tracked table names of
    // 22+ chars) — it substitutes a short hash instead.
    const sql =
      'ALTER TABLE "game_data"."tournaments_external_ids_history" ADD CONSTRAINT "tournaments_external_ids_hi_Ab12CdEfGh34_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."tournaments_external_ids"("id");';

    expect(
      findHistorySelfFkConstraintName(
        sql,
        'game_data',
        'tournaments_external_ids',
      ),
    ).toBe('tournaments_external_ids_hi_Ab12CdEfGh34_fkey');
  });

  it('throws when no matching FK statement is found', () => {
    expect(() =>
      findHistorySelfFkConstraintName('', 'game_data', 'coaches'),
    ).toThrow(/Could not find self-referencing FK constraint/);
  });
});

describe('buildDeferrableHistoryFkSql', () => {
  it('makes the history table’s self-referencing FK deferrable using the given constraint name', () => {
    const result = buildDeferrableHistoryFkSql(
      'game_data',
      'coaches_external_ids',
      'coaches_external_ids_history_id_coaches_external_ids_id_fkey',
    );
    expect(result).toBe(
      'ALTER TABLE "game_data"."coaches_external_ids_history" ALTER CONSTRAINT ' +
        '"coaches_external_ids_history_id_coaches_external_ids_id_fkey" ' +
        'DEFERRABLE INITIALLY DEFERRED;',
    );
  });
});

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

describe('findTypeConflicts', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function writeSnapshot(
    folder: string,
    columns: Array<{
      table: string;
      name: string;
      type: string;
    }>,
  ) {
    mkdirSync(folder, { recursive: true });
    writeFileSync(
      join(folder, 'snapshot.json'),
      JSON.stringify({
        ddl: columns.map((c) => ({
          entityType: 'columns',
          schema: 'game_data',
          table: c.table,
          name: c.name,
          type: c.type,
        })),
      }),
    );
  }

  it('flags a column whose history type was kept rather than adopted', () => {
    dir = mkdtempSync(join(tmpdir(), 'db-generate-conflicts-'));
    const previous = join(dir, '20260101000000_previous');
    const next = join(dir, '20260102000000_next');
    writeSnapshot(previous, [
      { table: 'coaches', name: 'id', type: 'integer' },
      { table: 'coaches_history', name: 'id', type: 'integer' },
    ]);
    writeSnapshot(next, [
      { table: 'coaches', name: 'id', type: 'bigint' },
      { table: 'coaches_history', name: 'id', type: 'integer' },
    ]);

    expect(findTypeConflicts(previous, next)).toEqual([
      {
        schema: 'game_data',
        table: 'coaches',
        column: 'id',
        previousType: 'integer',
        currentType: 'bigint',
      },
    ]);
  });

  it('does not flag a column that was safely widened and adopted', () => {
    dir = mkdtempSync(join(tmpdir(), 'db-generate-conflicts-'));
    const previous = join(dir, '20260101000000_previous');
    const next = join(dir, '20260102000000_next');
    writeSnapshot(previous, [
      { table: 'coaches', name: 'name', type: 'varchar(255)' },
      { table: 'coaches_history', name: 'name', type: 'varchar(255)' },
    ]);
    writeSnapshot(next, [
      { table: 'coaches', name: 'name', type: 'varchar(300)' },
      { table: 'coaches_history', name: 'name', type: 'varchar(300)' },
    ]);

    expect(findTypeConflicts(previous, next)).toEqual([]);
  });

  it('does not flag a column whose type is unchanged', () => {
    dir = mkdtempSync(join(tmpdir(), 'db-generate-conflicts-'));
    const previous = join(dir, '20260101000000_previous');
    const next = join(dir, '20260102000000_next');
    writeSnapshot(previous, [
      { table: 'coaches', name: 'name', type: 'varchar(255)' },
      { table: 'coaches_history', name: 'name', type: 'varchar(255)' },
    ]);
    writeSnapshot(next, [
      { table: 'coaches', name: 'name', type: 'varchar(255)' },
      { table: 'coaches_history', name: 'name', type: 'varchar(255)' },
    ]);

    expect(findTypeConflicts(previous, next)).toEqual([]);
  });

  it('returns an empty array when there is no previous snapshot', () => {
    dir = mkdtempSync(join(tmpdir(), 'db-generate-conflicts-'));
    const next = join(dir, '20260101000000_first');
    writeSnapshot(next, [
      { table: 'coaches', name: 'id', type: 'integer' },
      { table: 'coaches_history', name: 'id', type: 'integer' },
    ]);

    expect(findTypeConflicts(undefined, next)).toEqual([]);
  });
});

describe('buildTypeConflictComment', () => {
  it('describes the kept type and the attempted change', () => {
    const comment = buildTypeConflictComment({
      schema: 'game_data',
      table: 'coaches',
      column: 'id',
      previousType: 'integer',
      currentType: 'bigint',
    });
    expect(comment).toContain('coaches.id');
    expect(comment).toContain('integer');
    expect(comment).toContain('bigint');
    expect(comment).toContain('coaches_history');
    expect(comment.startsWith('-- ')).toBe(true);
  });
});
