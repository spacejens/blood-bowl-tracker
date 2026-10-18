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
    batch('010-after-later');
    batch('002-after-initial-sources');
    batch('001-before-initial-sources');

    expect(await catalog.discover(dataDir)).toEqual([
      {
        name: '001-before-initial-sources',
        number: 1,
        phase: 'before',
        dir: join(dataDir, 'batches', '001-before-initial-sources'),
      },
      {
        name: '002-after-initial-sources',
        number: 2,
        phase: 'after',
        dir: join(dataDir, 'batches', '002-after-initial-sources'),
      },
      {
        name: '010-after-later',
        number: 10,
        phase: 'after',
        dir: join(dataDir, 'batches', '010-after-later'),
      },
    ]);
  });

  it('ignores files beside the batch directories', async () => {
    batch('001-before-a');
    writeFileSync(join(dataDir, 'batches', '.DS_Store'), '');

    expect((await catalog.discover(dataDir)).map((b) => b.name)).toEqual([
      '001-before-a',
    ]);
  });

  it.each([
    '01-before-a',
    '001-during-a',
    '001-before-Upper',
    '001-before-',
    '001-before-a_b',
  ])('rejects the directory name %s', async (name) => {
    batch(name);

    await expect(catalog.discover(dataDir)).rejects.toThrow(name);
  });

  it('rejects two batches with the same number', async () => {
    batch('002-after-a');
    batch('002-after-b');

    await expect(catalog.discover(dataDir)).rejects.toThrow(
      /002-after-a.*002-after-b/,
    );
  });

  it('rejects a before batch numbered above an after batch', async () => {
    batch('001-before-a');
    batch('002-after-b');
    batch('003-before-c');

    await expect(catalog.discover(dataDir)).rejects.toThrow(
      /003-before-c.*002-after-b/,
    );
  });

  it('accepts batches of only one phase', async () => {
    batch('001-after-a');
    batch('002-after-b');

    expect(await catalog.discover(dataDir)).toHaveLength(2);
  });

  it('fails when there is no batches directory', async () => {
    await expect(catalog.discover(dataDir)).rejects.toThrow(/ENOENT/);
  });
});
