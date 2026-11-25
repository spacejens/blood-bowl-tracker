import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ManualBatchLayoutService } from './manual-batch-layout.service';
import { ManualBatchNameService } from './manual-batch-name.service';

describe('ManualBatchLayoutService', () => {
  let root: string;
  let batchesDir: string;
  let layout: ManualBatchLayoutService;

  beforeEach(async () => {
    // ManualBatchNameService is pure and dependency-free, so it is real.
    const moduleRef = await Test.createTestingModule({
      providers: [ManualBatchLayoutService, ManualBatchNameService],
    }).compile();
    layout = moduleRef.get(ManualBatchLayoutService);
    root = mkdtempSync(join(tmpdir(), 'manual-batch-layout-'));
    batchesDir = join(root, 'batches');
    mkdirSync(batchesDir);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function batch(name: string): void {
    mkdirSync(join(batchesDir, name), { recursive: true });
  }

  describe('listBatches', () => {
    it('lists the batch directories in number order', async () => {
      batch('010-later');
      batch('002-initial-cleanup');
      batch('001-initial-seed');

      expect(await layout.listBatches(batchesDir)).toEqual([
        {
          name: '001-initial-seed',
          number: 1,
          dir: join(batchesDir, '001-initial-seed'),
        },
        {
          name: '002-initial-cleanup',
          number: 2,
          dir: join(batchesDir, '002-initial-cleanup'),
        },
        { name: '010-later', number: 10, dir: join(batchesDir, '010-later') },
      ]);
    });

    it('ignores files beside the batch directories', async () => {
      batch('001-a');
      writeFileSync(join(batchesDir, '.DS_Store'), '');

      expect((await layout.listBatches(batchesDir)).map((b) => b.name)).toEqual(
        ['001-a'],
      );
    });

    it.each(['01-a', '001', '001-', '001-Upper', '001-a_b', '001-a--b'])(
      'rejects the directory name %s',
      async (name) => {
        batch(name);

        await expect(layout.listBatches(batchesDir)).rejects.toThrow(name);
      },
    );

    it('names the expected directory pattern in the error', async () => {
      batch('1-a');

      await expect(layout.listBatches(batchesDir)).rejects.toThrow(
        /NNN-<slug>/,
      );
    });

    it('accepts a multi-word slug', async () => {
      batch('004-reset-curated-names');

      expect(await layout.listBatches(batchesDir)).toHaveLength(1);
    });

    it('rejects two batches with the same number', async () => {
      batch('002-a');
      batch('002-b');

      await expect(layout.listBatches(batchesDir)).rejects.toThrow(
        /002-a.*002-b/,
      );
    });

    it('fails when the batches directory is missing', async () => {
      await expect(layout.listBatches(join(root, 'nope'))).rejects.toThrow(
        /ENOENT/,
      );
    });
  });

  describe('listBatchDirsLenient', () => {
    it('lists every directory, badly named ones included, sorted', async () => {
      batch('002-b');
      batch('Bad Name');
      batch('001-a');
      writeFileSync(join(batchesDir, 'file.txt'), '');

      expect(await layout.listBatchDirsLenient(batchesDir)).toEqual(
        ['001-a', '002-b', 'Bad Name'].sort(),
      );
    });

    it('gives an empty list for a missing directory', async () => {
      expect(await layout.listBatchDirsLenient(join(root, 'nope'))).toEqual([]);
    });
  });

  describe('JSON5 listings', () => {
    beforeEach(() => {
      writeFileSync(join(batchesDir, 'b.json5'), '{}');
      writeFileSync(join(batchesDir, 'a.json5'), '{}');
      writeFileSync(join(batchesDir, 'notes.txt'), '');
      mkdirSync(join(batchesDir, 'x.json5'));
    });

    it('lists only plain .json5 files, sorted, when strict', async () => {
      expect(await layout.listJson5Files(batchesDir)).toEqual([
        'a.json5',
        'b.json5',
      ]);
    });

    it('lists any .json5 entry, directories included, when lenient', async () => {
      expect(await layout.listJson5FilesLenient(batchesDir)).toEqual([
        'a.json5',
        'b.json5',
        'x.json5',
      ]);
    });

    it('propagates an unreadable directory when strict', async () => {
      await expect(layout.listJson5Files(join(root, 'nope'))).rejects.toThrow(
        /ENOENT/,
      );
    });

    it('gives an empty list for an unreadable directory when lenient', async () => {
      expect(await layout.listJson5FilesLenient(join(root, 'nope'))).toEqual(
        [],
      );
    });
  });

  describe('readJson5', () => {
    it('parses comments and trailing commas', async () => {
      const path = join(root, 'data.json5');
      writeFileSync(path, '// note\n{ a: 1, /* c */ b: [2,], }\n');

      expect(await layout.readJson5(path)).toEqual({ a: 1, b: [2] });
    });

    it('rejects a malformed file with a message naming the path', async () => {
      const path = join(root, 'bad.json5');
      writeFileSync(path, '{ a: ');

      await expect(layout.readJson5(path)).rejects.toThrow(
        `Failed to parse ${path}:`,
      );
    });
  });
});
