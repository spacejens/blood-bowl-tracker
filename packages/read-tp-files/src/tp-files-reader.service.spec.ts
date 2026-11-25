import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TpFilesReaderService } from './tp-files-reader.service';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'read-tp-files-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('TpFilesReaderService', () => {
  let service: TpFilesReaderService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TpFilesReaderService],
    }).compile();
    service = moduleRef.get(TpFilesReaderService);
  });

  describe('listEras', () => {
    it('returns the era directories, sorted, without teams or plain files', async () => {
      mkdirSync(join(dir, 'third-era'));
      mkdirSync(join(dir, 'fourth-era'));
      mkdirSync(join(dir, 'teams'));
      writeFileSync(join(dir, 'stray.json'), '{}');

      expect(await service.listEras(dir)).toEqual(['fourth-era', 'third-era']);
    });

    it('returns an empty list for a missing data directory', async () => {
      expect(await service.listEras(join(dir, 'missing'))).toEqual([]);
    });
  });

  describe('listCompetitions', () => {
    it('returns the competitions sorted', async () => {
      mkdirSync(join(dir, 'third-era', 'b'), { recursive: true });
      mkdirSync(join(dir, 'third-era', 'a'));

      expect(await service.listCompetitions(dir, 'third-era')).toEqual([
        'a',
        'b',
      ]);
    });

    it('returns an empty list for a missing era', async () => {
      expect(await service.listCompetitions(dir, 'nope')).toEqual([]);
    });

    it('propagates errors other than a missing directory', async () => {
      writeFileSync(join(dir, 'third-era'), 'not a directory');

      await expect(
        service.listCompetitions(dir, 'third-era'),
      ).rejects.toMatchObject({ code: 'ENOTDIR' });
    });
  });

  describe('listFiles', () => {
    it('returns only plain json files, sorted', async () => {
      const competition = join(dir, 'third-era', 'c');
      mkdirSync(join(competition, 'sub.json'), { recursive: true });
      writeFileSync(join(competition, 'match_2.json'), '{}');
      writeFileSync(join(competition, 'match_1.json'), '{}');
      writeFileSync(join(competition, 'notes.txt'), '');

      expect(await service.listFiles(dir, 'third-era', 'c')).toEqual([
        'match_1.json',
        'match_2.json',
      ]);
    });

    it('returns an empty list when the directory is missing', async () => {
      expect(await service.listFiles(dir, 'third-era', 'c')).toEqual([]);
    });
  });

  describe('teams', () => {
    it('lists the rules sets and their files', async () => {
      mkdirSync(join(dir, 'teams', 'BB2020'), { recursive: true });
      writeFileSync(
        join(dir, 'teams', 'BB2020', 'rosters_masters?ruleSet=20.json'),
        '{}',
      );

      expect(await service.listTeamsRulesSets(dir)).toEqual(['BB2020']);
      expect(await service.listTeamsFiles(dir, 'BB2020')).toEqual([
        'rosters_masters?ruleSet=20.json',
      ]);
    });

    it('lists only plain json files under a rules set, sorted', async () => {
      const rulesSet = join(dir, 'teams', 'BB2025');
      mkdirSync(join(rulesSet, 'sub.json'), { recursive: true });
      writeFileSync(join(rulesSet, 'rosters_masters?ruleSet=25.json'), '{}');
      writeFileSync(join(rulesSet, 'notes.txt'), '');

      expect(await service.listTeamsFiles(dir, 'BB2025')).toEqual([
        'rosters_masters?ruleSet=25.json',
      ]);
    });

    it('lists no rules sets and no files when the teams directory is missing', async () => {
      expect(await service.listTeamsRulesSets(dir)).toEqual([]);
      expect(await service.listTeamsFiles(dir, 'BB2025')).toEqual([]);
    });

    it('lists only directories as rules sets', async () => {
      mkdirSync(join(dir, 'teams', 'BB2025'), { recursive: true });
      writeFileSync(join(dir, 'teams', 'stray.json'), '{}');

      expect(await service.listTeamsRulesSets(dir)).toEqual(['BB2025']);
    });

    it('propagates a teams listing failure other than a missing directory', async () => {
      writeFileSync(join(dir, 'teams'), 'not a directory');

      await expect(service.listTeamsRulesSets(dir)).rejects.toMatchObject({
        code: 'ENOTDIR',
      });
    });
  });

  describe('readJson', () => {
    it('returns the path and parsed content', async () => {
      mkdirSync(join(dir, 'third-era', 'c'), { recursive: true });
      writeFileSync(
        join(dir, 'third-era', 'c', 'match_1.json'),
        JSON.stringify({ a: 1 }),
      );

      expect(
        await service.readJson(dir, ['third-era', 'c', 'match_1.json']),
      ).toEqual({
        path: join(dir, 'third-era', 'c', 'match_1.json'),
        content: { a: 1 },
      });
    });

    it('returns null for a missing file', async () => {
      expect(await service.readJson(dir, ['nope.json'])).toBeNull();
    });

    it('propagates read errors other than a missing file', async () => {
      mkdirSync(join(dir, 'a.json'));

      await expect(service.readJson(dir, ['a.json'])).rejects.toMatchObject({
        code: 'EISDIR',
      });
    });

    it('rejects malformed JSON naming the full path', async () => {
      writeFileSync(join(dir, 'bad.json'), '{oops');

      await expect(service.readJson(dir, ['bad.json'])).rejects.toThrow(
        `Failed to parse TP file ${join(dir, 'bad.json')}`,
      );
    });

    it.each([['..'], ['a/b.json'], ['a\\b.json'], ['.'], ['']])(
      'rejects the unsafe segment %j',
      async (segment) => {
        await expect(
          service.readJson(
            dir,
            segment === '..' ? [segment, 'x.json'] : [segment],
          ),
        ).rejects.toThrow('Unsafe TP data path segment');
      },
    );
  });
});
