import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DbGenerateService } from './db-generate.service.js';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

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

describe('DbGenerateService', () => {
  let service: DbGenerateService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [DbGenerateService],
    }).compile();
    service = moduleRef.get(DbGenerateService);
  });

  describe('buildTriggerSql', () => {
    it('builds DROP+CREATE statements for both the versioning and set_updated_at triggers', () => {
      const result = service.buildTriggerSql('game_data', 'coaches');
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

      expect(service.findNewHistoryTables(previous, next)).toEqual([
        'game_data.coaches_history',
      ]);
    });

    it('treats every history table as new when there is no previous snapshot', () => {
      dir = mkdtempSync(join(tmpdir(), 'db-generate-'));
      const next = join(dir, '20260101000000_first');
      writeSnapshot(next, [
        { schema: 'game_data', name: 'coaches' },
        { schema: 'game_data', name: 'coaches_history' },
      ]);

      expect(service.findNewHistoryTables(undefined, next)).toEqual([
        'game_data.coaches_history',
      ]);
    });

    it('ignores non-history tables that are new', () => {
      dir = mkdtempSync(join(tmpdir(), 'db-generate-'));
      const previous = join(dir, '20260101000000_previous');
      const next = join(dir, '20260102000000_next');
      writeSnapshot(previous, []);
      writeSnapshot(next, [{ schema: 'game_data', name: 'races' }]);

      expect(service.findNewHistoryTables(previous, next)).toEqual([]);
    });

    it('treats a folder with no snapshot.json as having no tables', () => {
      dir = mkdtempSync(join(tmpdir(), 'db-generate-'));
      const previous = join(dir, '20260101000000_previous');
      const next = join(dir, '20260102000000_next');
      mkdirSync(previous, { recursive: true });
      writeSnapshot(next, [{ schema: 'game_data', name: 'coaches_history' }]);

      expect(service.findNewHistoryTables(previous, next)).toEqual([
        'game_data.coaches_history',
      ]);
    });

    it('ignores snapshot entries whose entityType is not tables', () => {
      dir = mkdtempSync(join(tmpdir(), 'db-generate-'));
      const previous = join(dir, '20260101000000_previous');
      const next = join(dir, '20260102000000_next');
      writeSnapshot(previous, []);
      mkdirSync(next, { recursive: true });
      writeFileSync(
        join(next, 'snapshot.json'),
        JSON.stringify({
          ddl: [
            {
              entityType: 'indexes',
              schema: 'game_data',
              name: 'coaches_history',
            },
          ],
        }),
      );

      expect(service.findNewHistoryTables(previous, next)).toEqual([]);
    });
  });

  describe('hasMigrationName', () => {
    it('accepts --name followed by a value', () => {
      expect(service.hasMigrationName(['--name', 'add_players_table'])).toBe(
        true,
      );
    });

    it('accepts --name=value', () => {
      expect(service.hasMigrationName(['--name=add_players_table'])).toBe(true);
    });

    it('accepts --name among other passthrough args', () => {
      expect(
        service.hasMigrationName(['--config', 'x', '--name', 'add_players']),
      ).toBe(true);
    });

    it('rejects args with no --name at all', () => {
      expect(service.hasMigrationName([])).toBe(false);
      expect(service.hasMigrationName(['--config', 'drizzle.config.ts'])).toBe(
        false,
      );
    });

    it('rejects --name with a missing value', () => {
      expect(service.hasMigrationName(['--name'])).toBe(false);
    });

    it('rejects --name followed by another flag instead of a value', () => {
      expect(service.hasMigrationName(['--name', '--config'])).toBe(false);
    });

    it('rejects an empty --name value', () => {
      expect(service.hasMigrationName(['--name', ''])).toBe(false);
      expect(service.hasMigrationName(['--name', '   '])).toBe(false);
      expect(service.hasMigrationName(['--name='])).toBe(false);
    });
  });

  describe('rewriteHistoryDropColumns', () => {
    it('rewrites a DROP COLUMN on a history table to DROP NOT NULL', () => {
      const sql =
        'ALTER TABLE "game_data"."coaches_history" DROP COLUMN "nickname";';
      expect(service.rewriteHistoryDropColumns(sql)).toBe(
        'ALTER TABLE "game_data"."coaches_history" ALTER COLUMN "nickname" DROP NOT NULL;',
      );
    });

    it('leaves DROP COLUMN on a non-history (tracked) table untouched', () => {
      const sql = 'ALTER TABLE "game_data"."coaches" DROP COLUMN "nickname";';
      expect(service.rewriteHistoryDropColumns(sql)).toBe(sql);
    });

    it('rewrites every history DROP COLUMN across a multi-statement migration', () => {
      const sql =
        'ALTER TABLE "game_data"."coaches" DROP COLUMN "nickname";--> statement-breakpoint\n' +
        'ALTER TABLE "game_data"."coaches_history" DROP COLUMN "nickname";--> statement-breakpoint\n' +
        'ALTER TABLE "game_data"."teams_history" DROP COLUMN "motto";';
      expect(service.rewriteHistoryDropColumns(sql)).toBe(
        'ALTER TABLE "game_data"."coaches" DROP COLUMN "nickname";--> statement-breakpoint\n' +
          'ALTER TABLE "game_data"."coaches_history" ALTER COLUMN "nickname" DROP NOT NULL;--> statement-breakpoint\n' +
          'ALTER TABLE "game_data"."teams_history" ALTER COLUMN "motto" DROP NOT NULL;',
      );
    });
  });

  describe('rewriteHistorySetNotNull', () => {
    it('removes a SET NOT NULL statement on a history table', () => {
      const sql =
        'ALTER TABLE "game_data"."competitions_history" ALTER COLUMN "start_date" SET NOT NULL;';
      expect(service.rewriteHistorySetNotNull(sql)).toBe('');
    });

    it('removes the history statement without leaving a dangling or doubled breakpoint', () => {
      const sql =
        'ALTER TABLE "game_data"."competitions" ALTER COLUMN "start_date" SET NOT NULL;--> statement-breakpoint\n' +
        'ALTER TABLE "game_data"."competitions_history" ALTER COLUMN "start_date" SET NOT NULL;';
      expect(service.rewriteHistorySetNotNull(sql)).toBe(
        'ALTER TABLE "game_data"."competitions" ALTER COLUMN "start_date" SET NOT NULL;',
      );
    });

    it('removes a history statement from the middle of a multi-statement migration', () => {
      const sql =
        'ALTER TABLE "game_data"."coaches" ALTER COLUMN "name" SET NOT NULL;--> statement-breakpoint\n' +
        'ALTER TABLE "game_data"."coaches_history" ALTER COLUMN "name" SET NOT NULL;--> statement-breakpoint\n' +
        'ALTER TABLE "game_data"."teams" ALTER COLUMN "motto" SET NOT NULL;';
      expect(service.rewriteHistorySetNotNull(sql)).toBe(
        'ALTER TABLE "game_data"."coaches" ALTER COLUMN "name" SET NOT NULL;--> statement-breakpoint\n' +
          'ALTER TABLE "game_data"."teams" ALTER COLUMN "motto" SET NOT NULL;',
      );
      expect(service.rewriteHistorySetNotNull(sql)).not.toContain(
        '--> statement-breakpoint\n--> statement-breakpoint',
      );
    });

    it('leaves a SET NOT NULL on a non-history (tracked) table untouched', () => {
      const sql =
        'ALTER TABLE "game_data"."coaches" ALTER COLUMN "name" SET NOT NULL;';
      expect(service.rewriteHistorySetNotNull(sql)).toBe(sql);
    });

    it('returns sql unchanged when there is no history SET NOT NULL statement', () => {
      const sql =
        'ALTER TABLE "game_data"."coaches_history" DROP COLUMN "nickname";';
      expect(service.rewriteHistorySetNotNull(sql)).toBe(sql);
    });
  });

  describe('rewriteHistoryAddNotNullColumn', () => {
    it('strips NOT NULL from a new column added to a history table', () => {
      const sql =
        'ALTER TABLE "game_data"."positions_race_eras_history" ADD COLUMN "move" integer NOT NULL;';
      expect(service.rewriteHistoryAddNotNullColumn(sql)).toBe(
        'ALTER TABLE "game_data"."positions_race_eras_history" ADD COLUMN "move" integer;',
      );
    });

    it('leaves a nullable column added to a history table untouched', () => {
      const sql =
        'ALTER TABLE "game_data"."positions_race_eras_history" ADD COLUMN "passing" integer;';
      expect(service.rewriteHistoryAddNotNullColumn(sql)).toBe(sql);
    });

    it('leaves an ADD COLUMN NOT NULL on a non-history (tracked) table untouched', () => {
      const sql =
        'ALTER TABLE "game_data"."positions_race_eras" ADD COLUMN "move" integer DEFAULT 0 NOT NULL;';
      expect(service.rewriteHistoryAddNotNullColumn(sql)).toBe(sql);
    });

    it('strips NOT NULL from every history ADD COLUMN across a multi-statement migration', () => {
      const sql =
        'ALTER TABLE "game_data"."positions_race_eras" ADD COLUMN "move" integer DEFAULT 0 NOT NULL;--> statement-breakpoint\n' +
        'ALTER TABLE "game_data"."positions_race_eras_history" ADD COLUMN "move" integer NOT NULL;--> statement-breakpoint\n' +
        'ALTER TABLE "game_data"."positions_race_eras_history" ADD COLUMN "strength" integer NOT NULL;';
      expect(service.rewriteHistoryAddNotNullColumn(sql)).toBe(
        'ALTER TABLE "game_data"."positions_race_eras" ADD COLUMN "move" integer DEFAULT 0 NOT NULL;--> statement-breakpoint\n' +
          'ALTER TABLE "game_data"."positions_race_eras_history" ADD COLUMN "move" integer;--> statement-breakpoint\n' +
          'ALTER TABLE "game_data"."positions_race_eras_history" ADD COLUMN "strength" integer;',
      );
    });

    it('returns sql unchanged when there is no history ADD COLUMN NOT NULL statement', () => {
      const sql =
        'ALTER TABLE "game_data"."coaches_history" DROP COLUMN "nickname";';
      expect(service.rewriteHistoryAddNotNullColumn(sql)).toBe(sql);
    });
  });

  describe('rewriteNewHistoryTableCreate', () => {
    const createBlock =
      'CREATE TABLE "game_data"."coaches_history" (\n' +
      '\t"id" integer,\n' +
      '\t"name" varchar(255) NOT NULL,\n' +
      '\t"created_at" timestamp with time zone NOT NULL,\n' +
      '\t"updated_at" timestamp with time zone NOT NULL,\n' +
      '\t"history_version" integer,\n' +
      '\t"history_period" tstzrange NOT NULL,\n' +
      '\tCONSTRAINT "coaches_history_pkey" PRIMARY KEY("id","history_version")\n' +
      ');';
    const fkStatement =
      'ALTER TABLE "game_data"."coaches_history" ADD CONSTRAINT ' +
      '"coaches_history_id_coaches_id_fkey" FOREIGN KEY ("id") ' +
      'REFERENCES "game_data"."coaches"("id");';

    it('replaces the explicit CREATE TABLE with a LIKE clause', () => {
      const result = service.rewriteNewHistoryTableCreate(
        createBlock,
        'game_data',
        'coaches',
      );
      expect(result).toBe(
        'CREATE TABLE "game_data"."coaches_history" (LIKE "game_data"."coaches");',
      );
    });

    it("removes drizzle-kit's generated self-FK statement and its breakpoint", () => {
      const sql =
        createBlock +
        '--> statement-breakpoint\n' +
        fkStatement +
        '--> statement-breakpoint\n' +
        'CREATE TRIGGER x;';
      const result = service.rewriteNewHistoryTableCreate(
        sql,
        'game_data',
        'coaches',
      );
      expect(result).not.toContain('coaches_history_id_coaches_id_fkey');
      expect(result).not.toContain('FOREIGN KEY ("id")');
      expect(result).toContain(
        'CREATE TABLE "game_data"."coaches_history" (LIKE "game_data"."coaches");',
      );
      expect(result).toContain('CREATE TRIGGER x;');
      // no doubled or dangling breakpoint left behind
      expect(result).not.toContain(
        '--> statement-breakpoint\n--> statement-breakpoint',
      );
    });

    it('removes a hashed self-FK constraint name for a long table name', () => {
      const sql =
        'ALTER TABLE "game_data"."tournaments_external_ids_history" ADD CONSTRAINT ' +
        '"tournaments_external_ids_hi_Ab12CdEfGh34_fkey" FOREIGN KEY ("id") ' +
        'REFERENCES "game_data"."tournaments_external_ids"("id");';
      const result = service.rewriteNewHistoryTableCreate(
        sql,
        'game_data',
        'tournaments_external_ids',
      );
      expect(result).not.toContain('FOREIGN KEY ("id")');
    });
  });

  describe('appendMigrationStatements', () => {
    it('appends with exactly one breakpoint when sql ends with a normal statement', () => {
      const sql =
        'ALTER TABLE "game_data"."coaches_history" ADD COLUMN "x" text;';
      const statements =
        'ALTER TABLE "game_data"."coaches_history" ADD CONSTRAINT "coaches_history_pkey" PRIMARY KEY ("id", "history_version");';
      const result = service.appendMigrationStatements(sql, statements);
      expect(result).toBe(`${sql}\n--> statement-breakpoint\n${statements}\n`);
      expect((result.match(/--> statement-breakpoint/g) ?? []).length).toBe(1);
    });

    it('normalizes a dangling trailing breakpoint before appending, leaving exactly one', () => {
      const sql =
        'ALTER TABLE "game_data"."zzz_verify_history" ALTER COLUMN "note" DROP NOT NULL;--> statement-breakpoint\n';
      const statements =
        'ALTER TABLE "game_data"."zzz_verify_b_history" ADD CONSTRAINT "zzz_verify_b_history_pkey" PRIMARY KEY ("id", "history_version");';
      const result = service.appendMigrationStatements(sql, statements);
      expect(result).not.toContain(
        '--> statement-breakpoint\n\n--> statement-breakpoint',
      );
      expect((result.match(/--> statement-breakpoint/g) ?? []).length).toBe(1);
      expect(result).toBe(
        'ALTER TABLE "game_data"."zzz_verify_history" ALTER COLUMN "note" DROP NOT NULL;' +
          `\n--> statement-breakpoint\n${statements}\n`,
      );
    });

    it('normalizes a dangling trailing breakpoint followed by a blank line before appending', () => {
      const sql =
        'ALTER TABLE "game_data"."zzz_verify_history" ALTER COLUMN "note" DROP NOT NULL;--> statement-breakpoint\n\n';
      const statements = 'CREATE TRIGGER x;';
      const result = service.appendMigrationStatements(sql, statements);
      expect(result).not.toContain(
        '--> statement-breakpoint\n\n--> statement-breakpoint',
      );
      expect((result.match(/--> statement-breakpoint/g) ?? []).length).toBe(1);
      expect(result).toBe(
        'ALTER TABLE "game_data"."zzz_verify_history" ALTER COLUMN "note" DROP NOT NULL;' +
          `\n--> statement-breakpoint\n${statements}\n`,
      );
    });

    it('trims a plain trailing newline (with no breakpoint marker) before appending', () => {
      const sql =
        'ALTER TABLE "game_data"."zzz_verify_history" ALTER COLUMN "note" DROP NOT NULL;\n';
      const statements = 'CREATE TRIGGER x;';
      const result = service.appendMigrationStatements(sql, statements);
      expect(result).toBe(
        'ALTER TABLE "game_data"."zzz_verify_history" ALTER COLUMN "note" DROP NOT NULL;' +
          `\n--> statement-breakpoint\n${statements}\n`,
      );
    });

    it('returns sql unchanged when statements is empty', () => {
      const sql =
        'ALTER TABLE "game_data"."coaches_history" ADD COLUMN "x" text;';
      expect(service.appendMigrationStatements(sql, '')).toBe(sql);
    });
  });

  describe('buildNewHistoryTableConstraintsSql', () => {
    it('emits a PK on (id, history_version) and a deferrable self-FK', () => {
      const result = service.buildNewHistoryTableConstraintsSql(
        'game_data',
        'coaches',
      );
      expect(result).toContain(
        'ALTER TABLE "game_data"."coaches_history" ADD CONSTRAINT ' +
          '"coaches_history_pkey" PRIMARY KEY ("id", "history_version");',
      );
      expect(result).toContain(
        'ALTER TABLE "game_data"."coaches_history" ADD CONSTRAINT ' +
          '"coaches_history_id_fkey" FOREIGN KEY ("id") REFERENCES ' +
          '"game_data"."coaches"("id") DEFERRABLE INITIALLY DEFERRED;',
      );
      expect(result).toContain('--> statement-breakpoint');
    });
  });

  describe('generate', () => {
    const createBlockSql =
      'CREATE TABLE "game_data"."coaches_history" (\n' +
      '\t"id" integer,\n' +
      '\t"name" varchar(255) NOT NULL,\n' +
      '\t"history_version" integer,\n' +
      '\t"history_period" tstzrange NOT NULL,\n' +
      '\tCONSTRAINT "coaches_history_pkey" PRIMARY KEY("id","history_version")\n' +
      ');--> statement-breakpoint\n' +
      'ALTER TABLE "game_data"."coaches_history" ADD CONSTRAINT ' +
      '"coaches_history_id_coaches_id_fkey" FOREIGN KEY ("id") ' +
      'REFERENCES "game_data"."coaches"("id");';

    let root: string;
    let migrationsDir: string;

    beforeEach(() => {
      root = mkdtempSync(join(tmpdir(), 'db-generate-root-'));
      migrationsDir = join(root, 'migrations');
      mkdirSync(migrationsDir, { recursive: true });
      vi.mocked(execFileSync).mockReset();
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
      rmSync(root, { recursive: true, force: true });
      vi.restoreAllMocks();
    });

    function addMigration(name: string, sql: string): string {
      const folder = join(migrationsDir, name);
      mkdirSync(folder, { recursive: true });
      writeFileSync(join(folder, 'migration.sql'), sql);
      return folder;
    }

    it('rewrites the new migration folder produced by drizzle-kit', () => {
      const previous = addMigration('20260101000000_previous', 'SELECT 1;');
      writeSnapshot(previous, [{ schema: 'game_data', name: 'coaches' }]);
      vi.mocked(execFileSync).mockImplementation(() => {
        const next = addMigration('20260102000000_next', createBlockSql);
        writeSnapshot(next, [
          { schema: 'game_data', name: 'coaches' },
          { schema: 'game_data', name: 'coaches_history' },
        ]);
        return '';
      });

      service.generate(['--name', 'add_coaches'], root);

      expect(execFileSync).toHaveBeenCalledWith(
        'drizzle-kit',
        ['generate', '--name', 'add_coaches'],
        { cwd: root, stdio: 'inherit' },
      );
      const written = readFileSync(
        join(migrationsDir, '20260102000000_next', 'migration.sql'),
        'utf-8',
      );
      expect(written).toContain(
        'CREATE TABLE "game_data"."coaches_history" (LIKE "game_data"."coaches");',
      );
      expect(written).not.toContain('coaches_history_id_coaches_id_fkey');
      expect(written).toContain(
        'ADD CONSTRAINT "coaches_history_pkey" PRIMARY KEY ("id", "history_version");',
      );
      expect(written).toContain(
        'ADD CONSTRAINT "coaches_history_id_fkey" FOREIGN KEY ("id") REFERENCES "game_data"."coaches"("id") DEFERRABLE INITIALLY DEFERRED;',
      );
      expect(written).toContain('CREATE TRIGGER coaches_versioning');
      expect(written).toContain('CREATE TRIGGER coaches_set_updated_at');
      expect(console.log).toHaveBeenCalledWith(
        'Rewrote history-table DDL (LIKE + PK/FK + triggers) for: game_data.coaches_history',
      );
    });

    it('treats a not-yet-created migrations directory as having no prior folders', () => {
      rmSync(migrationsDir, { recursive: true, force: true });
      const sql =
        'ALTER TABLE "game_data"."coaches" ADD COLUMN "nickname" text;';
      vi.mocked(execFileSync).mockImplementation(() => {
        const first = addMigration('20260101000000_first', sql);
        writeSnapshot(first, [{ schema: 'game_data', name: 'coaches' }]);
        return '';
      });

      service.generate(['--name', 'add_nickname'], root);

      expect(
        readFileSync(
          join(migrationsDir, '20260101000000_first', 'migration.sql'),
          'utf-8',
        ),
      ).toBe(sql);
    });

    it('leaves a new migration untouched when it needs no history rewriting', () => {
      const sql =
        'ALTER TABLE "game_data"."coaches" ADD COLUMN "nickname" text;';
      vi.mocked(execFileSync).mockImplementation(() => {
        const first = addMigration('20260101000000_first', sql);
        writeSnapshot(first, [{ schema: 'game_data', name: 'coaches' }]);
        return '';
      });

      service.generate(['--name', 'add_nickname'], root);

      expect(
        readFileSync(
          join(migrationsDir, '20260101000000_first', 'migration.sql'),
          'utf-8',
        ),
      ).toBe(sql);
      expect(console.log).not.toHaveBeenCalled();
    });

    it('does nothing when drizzle-kit produces no new migration folder', () => {
      const existing = addMigration('20260101000000_existing', 'SELECT 1;');
      writeSnapshot(existing, [{ schema: 'game_data', name: 'coaches' }]);
      vi.mocked(execFileSync).mockReturnValue('');

      service.generate(['--name', 'no_changes'], root);

      expect(readFileSync(join(existing, 'migration.sql'), 'utf-8')).toBe(
        'SELECT 1;',
      );
      expect(console.log).not.toHaveBeenCalled();
    });

    it('refuses to run drizzle-kit without a migration name', () => {
      const exit = vi
        .spyOn(process, 'exit')
        .mockImplementation((code?: number | string | null) => {
          throw new Error(`process.exit: ${String(code)}`);
        });

      expect(() => service.generate([], root)).toThrow('process.exit: 1');
      expect(exit).toHaveBeenCalledWith(1);
      expect(execFileSync).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith(
        'db:generate requires a descriptive migration name.\n' +
          'Pass one with --name, e.g.: pnpm db:generate --name add_players_table',
      );
    });
  });
});
