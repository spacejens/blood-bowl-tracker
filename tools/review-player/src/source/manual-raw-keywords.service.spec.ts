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
    mkdirSync(join(tempDir, 'before-other-importers'), { recursive: true });

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
      join(tempDir, 'before-other-importers', 'keywords.json5'),
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
      join(tempDir, 'before-other-importers', 'keywords.json5'),
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
      join(tempDir, 'before-other-importers', 'keywords.json5'),
      '{ this is not valid json5 ]',
    );

    expect(await service.all()).toEqual([]);
  });

  it('returns [] when the parsed JSON5 is not an object', async () => {
    writeFileSync(
      join(tempDir, 'before-other-importers', 'keywords.json5'),
      '42',
    );

    expect(await service.all()).toEqual([]);
  });

  it('skips an entry whose name or kind is not a string', async () => {
    writeFileSync(
      join(tempDir, 'before-other-importers', 'keywords.json5'),
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
      join(tempDir, 'before-other-importers', 'keywords.json5'),
      `
{
  keywords: 'not-an-array'
}
`,
    );

    expect(await service.all()).toEqual([]);
  });

  it('ignores an externalIds entry with a non-tourplay.net system', async () => {
    writeFileSync(
      join(tempDir, 'before-other-importers', 'keywords.json5'),
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
