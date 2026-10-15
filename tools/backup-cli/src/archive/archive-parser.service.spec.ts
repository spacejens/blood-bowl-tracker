import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { ArchiveParserService } from './archive-parser.service';

const LISTING = [
  ';',
  '; Archive created at 2026-10-14 03:17:05 UTC',
  ';     dbname: neondb',
  ';',
  '; Selected TOC Entries:',
  ';',
  '6; 2615 16389 SCHEMA - game_data neondb_owner',
  '7; 2615 16390 SCHEMA - drizzle neondb_owner',
  '5; 2615 16388 SCHEMA - discord_bot_usage neondb_owner',
  '230; 1255 16400 FUNCTION public versioning() neondb_owner',
  '240; 1259 16420 TABLE game_data coaches neondb_owner',
  '',
].join('\n');

const DATA_SCRIPT = [
  '--',
  '-- PostgreSQL database dump',
  '--',
  '\\restrict abc123',
  'SET statement_timeout = 0;',
  "SELECT pg_catalog.set_config('search_path', '', false);",
  '',
  'COPY drizzle.__drizzle_migrations (id, hash, created_at, name, applied_at) FROM stdin;',
  '2\th2\t1700000000001\t0002_b\t2026-01-02 00:00:00+00',
  '1\th1\t1700000000000\t0001_a\t2026-01-01 00:00:00+00',
  '3\th3\t1700000000002\t\\N\t2026-01-03 00:00:00+00',
  '\\.',
  '',
  'COPY game_data.coaches (id, name) FROM stdin;',
  '1\tAlice',
  '2\tBob\\twith tab',
  '\\.',
  '',
  'COPY game_data.teams (id, name) FROM stdin;',
  '\\.',
  '',
  'COPY "game_data"."players" ("id", "name") FROM stdin;',
  '1\tP1',
  '2\tP2',
  '3\tP3',
  '\\.',
  '',
  'COPY game_data.coaches_history (id, name) FROM stdin;',
  '1\tAlice',
  '\\.',
  '',
  '\\unrestrict abc123',
  '',
].join('\n');

describe('ArchiveParserService', () => {
  let service: ArchiveParserService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [ArchiveParserService],
    }).compile();
    service = moduleRef.get(ArchiveParserService);
  });

  describe('schemas', () => {
    it('lists every schema entry in the archive, sorted', () => {
      expect(service.schemas(LISTING)).toEqual([
        'discord_bot_usage',
        'drizzle',
        'game_data',
      ]);
    });

    it('ignores comments, schema comments and non-schema entries', () => {
      expect(
        service.schemas(
          [
            '; 1; 2615 1 SCHEMA - commented_out x',
            '4567; 0 0 COMMENT - SCHEMA public pg_database_owner',
            '240; 1259 16420 TABLE game_data coaches neondb_owner',
          ].join('\n'),
        ),
      ).toEqual([]);
    });

    it('reports a schema once even if listed twice', () => {
      expect(
        service.schemas(
          '1; 2615 1 SCHEMA - neon x\n2; 2615 1 SCHEMA - neon x\n',
        ),
      ).toEqual(['neon']);
    });
  });

  describe('contents', () => {
    it('reads migration names in id order, skipping NULL names', () => {
      expect(service.contents(DATA_SCRIPT).migrations).toEqual([
        '0001_a',
        '0002_b',
      ]);
    });

    it('counts each key table, with 0 for an empty or absent one, and ignores other tables', () => {
      expect(service.contents(DATA_SCRIPT).tableRowCounts).toEqual({
        coaches: 2,
        teams: 0,
        players: 3,
        matches: 0,
        competitions: 0,
      });
    });

    it('reports no migrations when the archive has no migrations table data', () => {
      expect(service.contents('SET x = 1;\n')).toEqual({
        migrations: [],
        tableRowCounts: {
          coaches: 0,
          teams: 0,
          players: 0,
          matches: 0,
          competitions: 0,
        },
      });
    });

    it('throws when a COPY block never ends', () => {
      expect(() =>
        service.contents(
          'COPY game_data.coaches (id, name) FROM stdin;\n1\tAlice\n',
        ),
      ).toThrow(
        "The backup's data for game_data.coaches ends without a COPY terminator.",
      );
    });

    it('throws when the migrations table has no name column', () => {
      expect(() =>
        service.contents(
          'COPY drizzle.__drizzle_migrations (id, hash) FROM stdin;\n1\th1\n\\.\n',
        ),
      ).toThrow(/has no id or name column \(columns: id, hash\)/);
    });
  });
});
