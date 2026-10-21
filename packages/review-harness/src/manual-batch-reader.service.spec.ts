import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ManualBatchReaderService } from './manual-batch-reader.service';

describe('ManualBatchReaderService', () => {
  let service: ManualBatchReaderService;
  let dir: string;

  function write(relativePath: string, contents: string): void {
    const path = join(dir, relativePath);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, contents, 'utf8');
  }

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'review-harness-batches-'));
    const moduleRef = await Test.createTestingModule({
      providers: [ManualBatchReaderService],
    }).compile();
    service = moduleRef.get(ManualBatchReaderService);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  describe('section', () => {
    it('pools a section across files in filename order, batches in batch-name order', async () => {
      write('002-b/a.json5', "{ races: ['002-b/a'] }");
      write('001-a/z.json5', "{ races: ['001-a/z'] }");
      write('001-a/b.json5', "{ races: ['001-a/b'] }");

      await expect(service.section(dir, 'races')).resolves.toEqual([
        '001-a/b',
        '001-a/z',
        '002-b/a',
      ]);
    });

    it('keeps each top-level section apart', async () => {
      write('001-a/a.json5', "{ races: ['race'], positions: ['position'] }");

      await expect(service.section(dir, 'positions')).resolves.toEqual([
        'position',
      ]);
    });

    it('returns [] for a section no file carries', async () => {
      write('001-a/a.json5', "{ races: ['race'] }");

      await expect(service.section(dir, 'keywords')).resolves.toEqual([]);
    });

    it('returns [] when the batches directory does not exist', async () => {
      await expect(
        service.section(join(dir, 'missing'), 'races'),
      ).resolves.toEqual([]);
    });

    it('reads only .json5 files', async () => {
      write('001-a/notes.txt', "{ races: ['x'] }");

      await expect(service.section(dir, 'races')).resolves.toEqual([]);
    });

    it('ignores files lying beside the batch directories', async () => {
      write('stray.json5', "{ races: ['x'] }");

      await expect(service.section(dir, 'races')).resolves.toEqual([]);
    });

    it('counts a file whose top level is an array as empty', async () => {
      write('001-a/a.json5', "[['races'], ['positions']]");

      await expect(service.section(dir, 'races')).resolves.toEqual([]);
      await expect(service.section(dir, '0')).resolves.toEqual([]);
    });

    it('counts a malformed file as empty and still reads the rest', async () => {
      write('001-a/a.json5', '{ races: [');
      write('001-a/b.json5', "{ races: ['kept'] }");

      await expect(service.section(dir, 'races')).resolves.toEqual(['kept']);
    });

    it('counts a file that is not an object as empty', async () => {
      write('001-a/a.json5', '42');

      await expect(service.section(dir, 'races')).resolves.toEqual([]);
    });

    it('counts an unreadable file as empty', async () => {
      mkdirSync(join(dir, '001-a', 'a-directory.json5'), { recursive: true });
      write('001-a/b.json5', "{ races: ['kept'] }");

      await expect(service.section(dir, 'races')).resolves.toEqual(['kept']);
    });

    it('ignores a top-level value that is not an array', async () => {
      write('001-a/a.json5', "{ races: 'not-an-array' }");

      await expect(service.section(dir, 'races')).resolves.toEqual([]);
    });

    it('reads a batches directory only once', async () => {
      write('001-a/a.json5', "{ races: ['race'], positions: ['position'] }");

      await service.section(dir, 'races');
      rmSync(join(dir, '001-a'), { recursive: true, force: true });

      await expect(service.section(dir, 'races')).resolves.toEqual(['race']);
      await expect(service.section(dir, 'positions')).resolves.toEqual([
        'position',
      ]);
    });

    it('memoizes per batches directory', async () => {
      write('one/001-a/a.json5', "{ races: ['one'] }");
      write('two/001-a/a.json5', "{ races: ['two'] }");

      await expect(service.section(join(dir, 'one'), 'races')).resolves.toEqual(
        ['one'],
      );
      await expect(service.section(join(dir, 'two'), 'races')).resolves.toEqual(
        ['two'],
      );
    });
  });

  describe('latestByKey', () => {
    it("keeps the last entry per key, in the first one's position", () => {
      const entries = [
        { key: 'a', value: 1 },
        { key: 'b', value: 2 },
        { key: 'a', value: 3 },
      ];

      expect(service.latestByKey(entries, (entry) => entry.key)).toEqual([
        { key: 'a', value: 3 },
        { key: 'b', value: 2 },
      ]);
    });

    it("always keeps an entry whose key is ''", () => {
      const entries = [
        { key: '', value: 1 },
        { key: '', value: 2 },
      ];

      expect(service.latestByKey(entries, (entry) => entry.key)).toEqual(
        entries,
      );
    });
  });
});
