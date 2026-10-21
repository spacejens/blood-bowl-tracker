import { join } from 'node:path';

import { ManualBatchReaderService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { ReviewPlayerConfigService } from '../config/review-player-config.service';
import { ManualRawKeywordsService } from './manual-raw-keywords.service';

const DATA_DIR = '/data/manual';
const BATCHES_DIR = join(DATA_DIR, 'batches');

describe('ManualRawKeywordsService', () => {
  let service: ManualRawKeywordsService;
  let reader: MockProxy<ManualBatchReaderService>;

  beforeEach(async () => {
    const config = mock<ReviewPlayerConfigService>();
    config.getDataDir.mockReturnValue(DATA_DIR);
    reader = mock<ManualBatchReaderService>();
    reader.section.mockResolvedValue([]);
    reader.latestByKey.mockReturnValue([]);

    const moduleRef = await Test.createTestingModule({
      providers: [
        ManualRawKeywordsService,
        { provide: ReviewPlayerConfigService, useValue: config },
        { provide: ManualBatchReaderService, useValue: reader },
      ],
    }).compile();

    service = moduleRef.get(ManualRawKeywordsService);
  });

  /** The shaped entries and key function last handed to `latestByKey`. */
  function latestByKeyCall(): [unknown[], (entry: unknown) => string] {
    const call = reader.latestByKey.mock.lastCall;
    if (call === undefined) {
      throw new Error('latestByKey was not called');
    }
    return call;
  }

  it("reads the curated batches' keywords section", async () => {
    await service.all();

    expect(reader.section).toHaveBeenCalledWith(BATCHES_DIR, 'keywords');
  });

  it('returns the keyword of each entry latestByKey keeps', async () => {
    const keyword = { name: 'Goblin', kind: 'species', code: '111' };
    reader.latestByKey.mockReturnValue([{ key: 'k', keyword }]);

    await expect(service.all()).resolves.toEqual([keyword]);
  });

  it('shapes an entry with a tourplay.net code, keyed by its sorted external ids', async () => {
    reader.section.mockResolvedValue([
      {
        name: 'Goblin',
        kind: 'species',
        externalIds: [
          { system: 'tourplay.net', id: '111' },
          { system: 'Name', id: 'Goblin' },
        ],
      },
    ]);

    await service.all();

    expect(latestByKeyCall()[0]).toEqual([
      {
        key: 'Name|Goblin,tourplay.net|111',
        keyword: { name: 'Goblin', kind: 'species', code: '111' },
      },
    ]);
  });

  it('stringifies a numeric tourplay.net id', async () => {
    reader.section.mockResolvedValue([
      {
        name: 'Goblin',
        kind: 'species',
        externalIds: [{ system: 'tourplay.net', id: 111 }],
      },
    ]);

    await service.all();

    expect(latestByKeyCall()[0]).toEqual([
      {
        key: 'tourplay.net|111',
        keyword: { name: 'Goblin', kind: 'species', code: '111' },
      },
    ]);
  });

  it('reads an entry with no usable tourplay.net id as code: null, keying only valid ids', async () => {
    reader.section.mockResolvedValue([
      {
        name: 'Goblin',
        kind: 'species',
        externalIds: [
          { system: 'Name', id: 'Goblin' },
          { system: 'tourplay.net', id: null },
          { id: '9' },
        ],
      },
    ]);

    await service.all();

    expect(latestByKeyCall()[0]).toEqual([
      {
        key: 'Name|Goblin',
        keyword: { name: 'Goblin', kind: 'species', code: null },
      },
    ]);
  });

  it("keys an entry with no or non-array external ids as ''", async () => {
    reader.section.mockResolvedValue([
      { name: 'Big Guy', kind: 'positional', externalIds: [] },
      { name: 'Orc', kind: 'species', externalIds: 'not-an-array' },
    ]);

    await service.all();

    expect(latestByKeyCall()[0]).toEqual([
      {
        key: '',
        keyword: { name: 'Big Guy', kind: 'positional', code: null },
      },
      { key: '', keyword: { name: 'Orc', kind: 'species', code: null } },
    ]);
  });

  it('skips an entry whose name or kind is not a string', async () => {
    reader.section.mockResolvedValue([
      { name: 'Goblin', kind: 'species', externalIds: [] },
      { name: null, kind: 'species', externalIds: [] },
      { name: 'Undead', externalIds: [] },
      'not an object',
    ]);

    await service.all();

    expect(latestByKeyCall()[0]).toEqual([
      { key: '', keyword: { name: 'Goblin', kind: 'species', code: null } },
    ]);
  });

  it('keys an entry by its prepared key', async () => {
    await service.all();
    const keyOf = latestByKeyCall()[1];

    expect(keyOf({ key: 'Name|Goblin', keyword: {} })).toBe('Name|Goblin');
  });
});
