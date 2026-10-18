import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BatchCatalogService } from './batch-catalog.service';

describe('BatchCatalogService', () => {
  let dataDir: string;
  let catalog: BatchCatalogService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [BatchCatalogService],
    }).compile();
    catalog = moduleRef.get(BatchCatalogService);
    dataDir = mkdtempSync(join(tmpdir(), 'import-manual-batches-'));
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  function batch(name: string): void {
    mkdirSync(join(dataDir, 'batches', name), { recursive: true });
  }

  it('lists the batch directories in number order', async () => {
    batch('010-later');
    batch('002-initial-cleanup');
    batch('001-initial-seed');

    expect(await catalog.discover(dataDir)).toEqual([
      {
        name: '001-initial-seed',
        number: 1,
        dir: join(dataDir, 'batches', '001-initial-seed'),
      },
      {
        name: '002-initial-cleanup',
        number: 2,
        dir: join(dataDir, 'batches', '002-initial-cleanup'),
      },
      {
        name: '010-later',
        number: 10,
        dir: join(dataDir, 'batches', '010-later'),
      },
    ]);
  });

  it('ignores files beside the batch directories', async () => {
    batch('001-a');
    writeFileSync(join(dataDir, 'batches', '.DS_Store'), '');

    expect((await catalog.discover(dataDir)).map((b) => b.name)).toEqual([
      '001-a',
    ]);
  });

  it.each(['01-a', '001', '001-', '001-Upper', '001-a_b', '001-a--b'])(
    'rejects the directory name %s',
    async (name) => {
      batch(name);

      await expect(catalog.discover(dataDir)).rejects.toThrow(name);
    },
  );

  it('names the expected directory pattern in the error', async () => {
    batch('1-a');

    await expect(catalog.discover(dataDir)).rejects.toThrow(/NNN-<slug>/);
  });

  it('accepts a multi-word slug', async () => {
    batch('004-reset-curated-names');

    expect(await catalog.discover(dataDir)).toHaveLength(1);
  });

  it('rejects two batches with the same number', async () => {
    batch('002-a');
    batch('002-b');

    await expect(catalog.discover(dataDir)).rejects.toThrow(/002-a.*002-b/);
  });

  it('fails when there is no batches directory', async () => {
    await expect(catalog.discover(dataDir)).rejects.toThrow(/ENOENT/);
  });
});
