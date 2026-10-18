import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { ReviewPlayerConfigService } from '../config/review-player-config.service';
import { ManualRawKeywordsService } from './manual-raw-keywords.service';

describe('ManualRawKeywordsService', () => {
  let service: ManualRawKeywordsService;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'manual-keywords-'));
    mkdirSync(join(tempDir, 'batches', '001-initial-seed'), {
      recursive: true,
    });

    const config = mock<ReviewPlayerConfigService>();
    config.getDataDir.mockReturnValue(tempDir);

    const moduleRef = await Test.createTestingModule({
      providers: [
        ManualRawKeywordsService,
        { provide: ReviewPlayerConfigService, useValue: config },
      ],
    }).compile();

    service = moduleRef.get(ManualRawKeywordsService);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('reads a curated keyword entry with a tourplay.net code', async () => {
    writeFileSync(
      join(tempDir, 'batches', '001-initial-seed', 'keywords.json5'),
      `
{
  keywords: [
    {
      name: 'Goblin',
      kind: 'species',
      externalIds: [
        { system: 'Name', id: 'Goblin' },
        { system: 'tourplay.net', id: '111' }
      ]
    }
  ]
}
`,
    );

    expect(await service.all()).toEqual([
      { name: 'Goblin', kind: 'species', code: '111' },
    ]);
  });

  it('reads a curated keyword entry with no tourplay.net id as code: null', async () => {
    writeFileSync(
      join(tempDir, 'batches', '001-initial-seed', 'keywords.json5'),
      `
{
  keywords: [
    {
      name: 'Big Guy',
      kind: 'positional',
      externalIds: [{ system: 'Name', id: 'Big Guy' }]
    }
  ]
}
`,
    );

    expect(await service.all()).toEqual([
      { name: 'Big Guy', kind: 'positional', code: null },
    ]);
  });

  it('returns [] when the file does not exist', async () => {
    expect(await service.all()).toEqual([]);
  });

  it('returns [] when the file is not valid JSON5', async () => {
    writeFileSync(
      join(tempDir, 'batches', '001-initial-seed', 'keywords.json5'),
      '{ this is not valid json5 ]',
    );

    expect(await service.all()).toEqual([]);
  });

  it('returns [] when the parsed JSON5 is not an object', async () => {
    writeFileSync(
      join(tempDir, 'batches', '001-initial-seed', 'keywords.json5'),
      '42',
    );

    expect(await service.all()).toEqual([]);
  });

  it('skips an entry whose name or kind is not a string', async () => {
    writeFileSync(
      join(tempDir, 'batches', '001-initial-seed', 'keywords.json5'),
      `
{
  keywords: [
    { name: 'Goblin', kind: 'species', externalIds: [] },
    { name: null, kind: 'species', externalIds: [] },
    { name: 'Undead', externalIds: [] }
  ]
}
`,
    );

    const entries = await service.all();

    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe('Goblin');
  });

  it('treats a non-array keywords or externalIds value as empty', async () => {
    writeFileSync(
      join(tempDir, 'batches', '001-initial-seed', 'keywords.json5'),
      `
{
  keywords: 'not-an-array'
}
`,
    );

    expect(await service.all()).toEqual([]);
  });

  it('lets a later batch restate a keyword, replacing the earlier entry in place', async () => {
    mkdirSync(join(tempDir, 'batches', '002-initial-cleanup'), {
      recursive: true,
    });
    writeFileSync(
      join(tempDir, 'batches', '001-initial-seed', 'keywords.json5'),
      `
{
  keywords: [
    { name: 'Goblin', kind: 'species', externalIds: [{ system: 'tourplay.net', id: '111' }] },
    { name: 'Undead', kind: 'species', externalIds: [{ system: 'tourplay.net', id: '222' }] }
  ]
}
`,
    );
    writeFileSync(
      join(tempDir, 'batches', '002-initial-cleanup', 'keywords.json5'),
      `
{
  keywords: [
    { name: 'Goblins', kind: 'species', externalIds: [{ system: 'tourplay.net', id: '111' }] }
  ]
}
`,
    );

    expect(await service.all()).toEqual([
      { name: 'Goblins', kind: 'species', code: '111' },
      { name: 'Undead', kind: 'species', code: '222' },
    ]);
  });

  it('adds a keyword that only a later batch declares, from any file in the batch', async () => {
    mkdirSync(join(tempDir, 'batches', '002-initial-cleanup'), {
      recursive: true,
    });
    writeFileSync(
      join(tempDir, 'batches', '001-initial-seed', 'keywords.json5'),
      `{ keywords: [{ name: 'Goblin', kind: 'species', externalIds: [{ system: 'tourplay.net', id: '111' }] }] }`,
    );
    writeFileSync(
      join(tempDir, 'batches', '002-initial-cleanup', 'more.json5'),
      `{ keywords: [{ name: 'Orc', kind: 'species', externalIds: [{ system: 'tourplay.net', id: '333' }] }] }`,
    );

    expect(await service.all()).toEqual([
      { name: 'Goblin', kind: 'species', code: '111' },
      { name: 'Orc', kind: 'species', code: '333' },
    ]);
  });

  it('keeps entries without external ids from different batches apart', async () => {
    mkdirSync(join(tempDir, 'batches', '002-initial-cleanup'), {
      recursive: true,
    });
    writeFileSync(
      join(tempDir, 'batches', '001-initial-seed', 'keywords.json5'),
      `{ keywords: [{ name: 'Goblin', kind: 'species', externalIds: [] }] }`,
    );
    writeFileSync(
      join(tempDir, 'batches', '002-initial-cleanup', 'keywords.json5'),
      `{ keywords: [{ name: 'Orc', kind: 'species', externalIds: [] }] }`,
    );

    expect(await service.all()).toEqual([
      { name: 'Goblin', kind: 'species', code: null },
      { name: 'Orc', kind: 'species', code: null },
    ]);
  });

  it('ignores files lying beside the batch directories', async () => {
    writeFileSync(join(tempDir, 'batches', '.DS_Store'), 'x');
    writeFileSync(
      join(tempDir, 'batches', '001-initial-seed', 'keywords.json5'),
      `{ keywords: [{ name: 'Goblin', kind: 'species', externalIds: [] }] }`,
    );

    expect(await service.all()).toEqual([
      { name: 'Goblin', kind: 'species', code: null },
    ]);
  });

  it('ignores an externalIds entry with a non-tourplay.net system', async () => {
    writeFileSync(
      join(tempDir, 'batches', '001-initial-seed', 'keywords.json5'),
      `
{
  keywords: [
    {
      name: 'Goblin',
      kind: 'species',
      externalIds: [
        { system: 'Name', id: 'Goblin' },
        { system: 'tourplay.net', id: null }
      ]
    }
  ]
}
`,
    );

    expect(await service.all()).toEqual([
      { name: 'Goblin', kind: 'species', code: null },
    ]);
  });
});
