import { join } from 'node:path';

import { ManualBatchReaderService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { StarPlayerReviewConfigService } from '../config/review-star-player-config.service';
import type { ManualCharacteristicsEntry } from './manual-raw-data.service';
import { ManualRawDataService } from './manual-raw-data.service';

const DATA_DIR = '/data/manual';
const BATCHES_DIR = join(DATA_DIR, 'batches');

describe('ManualRawDataService', () => {
  let service: ManualRawDataService;
  let reader: MockProxy<ManualBatchReaderService>;

  beforeEach(async () => {
    const config = mock<StarPlayerReviewConfigService>();
    config.getDataDir.mockReturnValue(DATA_DIR);
    reader = mock<ManualBatchReaderService>();
    reader.section.mockResolvedValue([]);
    reader.latestByKey.mockReturnValue([]);

    const moduleRef = await Test.createTestingModule({
      providers: [
        ManualRawDataService,
        { provide: StarPlayerReviewConfigService, useValue: config },
        { provide: ManualBatchReaderService, useValue: reader },
      ],
    }).compile();

    service = moduleRef.get(ManualRawDataService);
  });

  /** The shaped entries and key function last handed to `latestByKey`. */
  function latestByKeyCall(): [unknown[], (entry: unknown) => string] {
    const call = reader.latestByKey.mock.lastCall;
    if (call === undefined) {
      throw new Error('latestByKey was not called');
    }
    return call;
  }

  describe('starPlayers', () => {
    it("reads the curated batches' positions section", async () => {
      await service.starPlayers();

      expect(reader.section).toHaveBeenCalledWith(BATCHES_DIR, 'positions');
    });

    it('returns the entries latestByKey keeps', async () => {
      const kept = [{ name: 'Griff Oberwald', externalIds: [] }];
      reader.latestByKey.mockReturnValue(kept);

      await expect(service.starPlayers()).resolves.toBe(kept);
    });

    it('keeps only named star entries, shaped to name and external ids', async () => {
      reader.section.mockResolvedValue([
        {
          name: 'Griff Oberwald',
          isStarPlayer: true,
          externalIds: [{ system: 'Name', id: 'Griff Oberwald' }],
        },
        { name: 'Dwarf Blitzer', isStarPlayer: false, externalIds: [] },
        { name: 'Morg the restated', externalIds: [] },
        { isStarPlayer: true, externalIds: [] },
      ]);

      await service.starPlayers();

      expect(latestByKeyCall()[0]).toEqual([
        {
          name: 'Griff Oberwald',
          externalIds: [{ system: 'Name', id: 'Griff Oberwald' }],
        },
      ]);
    });

    it('stringifies a numeric id and drops an invalid or non-array external id list', async () => {
      reader.section.mockResolvedValue([
        {
          name: 'X',
          isStarPlayer: true,
          externalIds: [{ system: 'tourplay.net', id: 42 }, { id: '6' }],
        },
        { name: 'Y', isStarPlayer: true, externalIds: 'not-an-array' },
      ]);

      await service.starPlayers();

      expect(latestByKeyCall()[0]).toEqual([
        { name: 'X', externalIds: [{ system: 'tourplay.net', id: '42' }] },
        { name: 'Y', externalIds: [] },
      ]);
    });

    it('keys an entry by its sorted external ids', async () => {
      await service.starPlayers();
      const keyOf = latestByKeyCall()[1];

      expect(
        keyOf({
          name: 'Griff',
          externalIds: [
            { system: 'tourplay.net', id: '7' },
            { system: 'Name', id: 'Griff' },
          ],
        }),
      ).toBe('Name|Griff,tourplay.net|7');
      expect(keyOf({ name: 'Griff', externalIds: [] })).toBe('');
    });
  });

  describe('availability', () => {
    it("reads the curated batches' positions section", async () => {
      await service.availability();

      expect(reader.section).toHaveBeenCalledWith(BATCHES_DIR, 'positions');
    });

    it('returns the entries latestByKey keeps', async () => {
      const kept = [{ name: 'Griff', externalIds: [], raceEras: [] }];
      reader.latestByKey.mockReturnValue(kept);

      await expect(service.availability()).resolves.toBe(kept);
    });

    it('shapes the named entries that carry raceEras, dropping invalid pairs', async () => {
      reader.section.mockResolvedValue([
        {
          name: 'Griff Oberwald',
          externalIds: [],
          raceEras: [
            {
              race: { system: 'Name', id: 'Human' },
              era: { system: 'Name', id: 'BB2020 era' },
            },
            { race: { system: 'Name', id: 'Human' } },
          ],
        },
        { name: 'No eras', externalIds: [] },
        { name: 'Bad eras', externalIds: [], raceEras: 'not-an-array' },
        { name: null, externalIds: [], raceEras: [] },
      ]);

      await service.availability();

      expect(latestByKeyCall()[0]).toEqual([
        {
          name: 'Griff Oberwald',
          externalIds: [],
          raceEras: [
            {
              race: { system: 'Name', id: 'Human' },
              era: { system: 'Name', id: 'BB2020 era' },
            },
          ],
        },
        { name: 'Bad eras', externalIds: [], raceEras: [] },
      ]);
    });

    it('keys an entry by its sorted external ids', async () => {
      await service.availability();
      const keyOf = latestByKeyCall()[1];

      expect(
        keyOf({
          name: 'Griff',
          externalIds: [{ system: 'Name', id: 'Griff' }],
          raceEras: [],
        }),
      ).toBe('Name|Griff');
    });
  });

  describe('characteristics', () => {
    it("reads the curated batches' positionRulesSets section", async () => {
      await service.characteristics();

      expect(reader.section).toHaveBeenCalledWith(
        BATCHES_DIR,
        'positionRulesSets',
      );
    });

    it('returns the entries latestByKey keeps', async () => {
      const kept: ManualCharacteristicsEntry[] = [
        {
          position: { system: 'Name', id: 'Griff Oberwald' },
          rulesSet: { system: 'Name', id: 'CRP' },
          move: 7,
          strength: 4,
          agility: 3,
          passing: null,
          armour: 9,
        },
      ];
      reader.latestByKey.mockReturnValue(kept);

      await expect(service.characteristics()).resolves.toBe(kept);
    });

    it('shapes an entry, reading an omitted passing as null', async () => {
      reader.section.mockResolvedValue([
        {
          position: { system: 'Name', id: 'Griff Oberwald' },
          rulesSet: { system: 'Name', id: 'CRP' },
          move: 7,
          strength: 4,
          agility: 3,
          armour: 9,
        },
      ]);

      await service.characteristics();

      expect(latestByKeyCall()[0]).toEqual([
        {
          position: { system: 'Name', id: 'Griff Oberwald' },
          rulesSet: { system: 'Name', id: 'CRP' },
          move: 7,
          strength: 4,
          agility: 3,
          passing: null,
          armour: 9,
        },
      ]);
    });

    it('drops an entry with no position or rules-set reference', async () => {
      reader.section.mockResolvedValue([{ move: 1 }]);

      await service.characteristics();

      expect(latestByKeyCall()[0]).toEqual([]);
    });

    it('keys an entry by its position and rules set', async () => {
      await service.characteristics();
      const keyOf = latestByKeyCall()[1];

      expect(
        keyOf({
          position: { system: 'Name', id: 'Griff' },
          rulesSet: { system: 'Name', id: 'BB2020' },
        }),
      ).toBe('Name|Griff::Name|BB2020');
    });
  });

  describe('keywords', () => {
    it("reads the curated batches' keywords section", async () => {
      await service.keywords();

      expect(reader.section).toHaveBeenCalledWith(BATCHES_DIR, 'keywords');
    });

    it('returns the keyword of each entry latestByKey keeps', async () => {
      const keyword = { name: 'Goblin', kind: 'species', code: '111' };
      reader.latestByKey.mockReturnValue([{ key: 'k', keyword }]);

      await expect(service.keywords()).resolves.toEqual([keyword]);
    });

    it('pulls out the tourplay.net id as code, keyed by the sorted external ids', async () => {
      reader.section.mockResolvedValue([
        {
          name: 'Goblin',
          kind: 'species',
          externalIds: [
            { system: 'Name', id: 'Goblin' },
            { system: 'tourplay.net', id: '111' },
          ],
        },
        {
          name: 'Big Guy',
          kind: 'positional',
          externalIds: [{ system: 'Name', id: 'Big Guy' }],
        },
        { name: 'No kind', externalIds: [] },
      ]);

      await service.keywords();

      expect(latestByKeyCall()[0]).toEqual([
        {
          key: 'Name|Goblin,tourplay.net|111',
          keyword: { name: 'Goblin', kind: 'species', code: '111' },
        },
        {
          key: 'Name|Big Guy',
          keyword: { name: 'Big Guy', kind: 'positional', code: null },
        },
      ]);
    });

    it('keys an entry by its prepared key', async () => {
      await service.keywords();
      const keyOf = latestByKeyCall()[1];

      expect(keyOf({ key: 'Name|Goblin', keyword: {} })).toBe('Name|Goblin');
    });
  });
});
