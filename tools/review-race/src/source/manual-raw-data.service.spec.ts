import { join } from 'node:path';

import { ManualBatchReaderService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { RaceReviewConfigService } from '../config/review-race-config.service';
import { ManualRawDataService } from './manual-raw-data.service';

const DATA_DIR = '/data/manual';
const BATCHES_DIR = join(DATA_DIR, 'batches');

describe('ManualRawDataService', () => {
  let service: ManualRawDataService;
  let reader: MockProxy<ManualBatchReaderService>;

  beforeEach(async () => {
    const config = mock<RaceReviewConfigService>();
    config.getDataDir.mockReturnValue(DATA_DIR);
    reader = mock<ManualBatchReaderService>();
    reader.section.mockResolvedValue([]);
    reader.latestByKey.mockReturnValue([]);

    const moduleRef = await Test.createTestingModule({
      providers: [
        ManualRawDataService,
        { provide: RaceReviewConfigService, useValue: config },
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

  describe('races', () => {
    it("reads the curated batches' races section", async () => {
      await service.races();

      expect(reader.section).toHaveBeenCalledWith(BATCHES_DIR, 'races');
    });

    it('returns the entries latestByKey keeps', async () => {
      const kept = [{ name: 'Dwarf', externalIds: [] }];
      reader.latestByKey.mockReturnValue(kept);

      await expect(service.races()).resolves.toBe(kept);
    });

    it('shapes an entry into its name and external ids', async () => {
      reader.section.mockResolvedValue([
        {
          name: 'Dwarf',
          externalIds: [{ system: 'tloeg.bbleague.se', id: '5' }],
          extra: 'ignored',
        },
      ]);

      await service.races();

      expect(latestByKeyCall()[0]).toEqual([
        {
          name: 'Dwarf',
          externalIds: [{ system: 'tloeg.bbleague.se', id: '5' }],
        },
      ]);
    });

    it('stringifies a numeric id and drops an id with no system or a non-string/number id', async () => {
      reader.section.mockResolvedValue([
        {
          name: 'Dwarf',
          externalIds: [
            { system: 'tloeg.bbleague.se', id: 5 },
            { id: '6' },
            { system: 'tloeg.bbleague.se', id: null },
            { system: 'tloeg.bbleague.se', id: true },
          ],
        },
      ]);

      await service.races();

      expect(latestByKeyCall()[0]).toEqual([
        {
          name: 'Dwarf',
          externalIds: [{ system: 'tloeg.bbleague.se', id: '5' }],
        },
      ]);
    });

    it('treats a non-array externalIds as no external ids', async () => {
      reader.section.mockResolvedValue([
        { name: 'Dwarf', externalIds: 'not-an-array' },
      ]);

      await service.races();

      expect(latestByKeyCall()[0]).toEqual([
        { name: 'Dwarf', externalIds: [] },
      ]);
    });

    it('skips an entry that is not an object or has no non-empty string name', async () => {
      reader.section.mockResolvedValue([
        { name: 'Dwarf', externalIds: [] },
        'not an object',
        123,
        null,
        { name: 123, externalIds: [] },
        { name: null, externalIds: [] },
        { name: '', externalIds: [] },
        { externalIds: [] },
      ]);

      await service.races();

      expect(latestByKeyCall()[0]).toEqual([
        { name: 'Dwarf', externalIds: [] },
      ]);
    });

    it('keys an entry by its sorted external ids, or by nothing when it has none', async () => {
      await service.races();
      const keyOf = latestByKeyCall()[1];

      expect(
        keyOf({
          name: 'Dwarf',
          externalIds: [
            { system: 'tourplay.net', id: '9' },
            { system: 'Name', id: 'Dwarf' },
          ],
        }),
      ).toBe('Name|Dwarf,tourplay.net|9');
      expect(keyOf({ name: 'Dwarf', externalIds: [] })).toBe('');
    });
  });

  describe('availability', () => {
    it("reads the curated batches' positions section", async () => {
      await service.availability();

      expect(reader.section).toHaveBeenCalledWith(BATCHES_DIR, 'positions');
    });

    it('returns the entries latestByKey keeps', async () => {
      const kept = [{ name: 'Lineman', externalIds: [], raceEras: [] }];
      reader.latestByKey.mockReturnValue(kept);

      await expect(service.availability()).resolves.toBe(kept);
    });

    it('shapes an entry into its name, external ids and race/era pairs', async () => {
      reader.section.mockResolvedValue([
        {
          name: 'Dark Elf Lineman',
          isStarPlayer: false,
          externalIds: [
            { system: 'Name', id: 'Dark Elf Team: Dark Elf Lineman' },
          ],
          raceEras: [
            {
              race: { system: 'tloeg.bbleague.se', id: '4' },
              era: { system: 'Name', id: 'First era' },
            },
          ],
        },
      ]);

      await service.availability();

      expect(latestByKeyCall()[0]).toEqual([
        {
          name: 'Dark Elf Lineman',
          externalIds: [
            { system: 'Name', id: 'Dark Elf Team: Dark Elf Lineman' },
          ],
          raceEras: [
            {
              race: { system: 'tloeg.bbleague.se', id: '4' },
              era: { system: 'Name', id: 'First era' },
            },
          ],
        },
      ]);
    });

    it('ignores a positions entry that carries no raceEras', async () => {
      reader.section.mockResolvedValue([
        {
          name: 'Lineman',
          externalIds: [{ system: 'Name', id: 'Orc: Lineman' }],
        },
      ]);

      await service.availability();

      expect(latestByKeyCall()[0]).toEqual([]);
    });

    it('skips an entry whose name is not a string', async () => {
      reader.section.mockResolvedValue([
        { name: 'Dark Elf Lineman', externalIds: [], raceEras: [] },
        { name: null, externalIds: [], raceEras: [] },
      ]);

      await service.availability();

      expect(latestByKeyCall()[0]).toEqual([
        { name: 'Dark Elf Lineman', externalIds: [], raceEras: [] },
      ]);
    });

    it('drops a race/era pair whose race or era ref is invalid', async () => {
      reader.section.mockResolvedValue([
        {
          name: 'Dark Elf Lineman',
          externalIds: [],
          raceEras: [
            {
              race: { system: 'tloeg.bbleague.se', id: '4' },
              era: { system: 'Name', id: 'First era' },
            },
            { race: { id: '4' }, era: { system: 'Name', id: 'First era' } },
            {
              race: { system: 'tloeg.bbleague.se', id: '4' },
              era: { system: 'Name' },
            },
          ],
        },
      ]);

      await service.availability();

      expect(latestByKeyCall()[0]).toEqual([
        {
          name: 'Dark Elf Lineman',
          externalIds: [],
          raceEras: [
            {
              race: { system: 'tloeg.bbleague.se', id: '4' },
              era: { system: 'Name', id: 'First era' },
            },
          ],
        },
      ]);
    });

    it('treats a non-array raceEras as no race eras', async () => {
      reader.section.mockResolvedValue([
        { name: 'Dark Elf Lineman', externalIds: [], raceEras: 'not-an-array' },
      ]);

      await service.availability();

      expect(latestByKeyCall()[0]).toEqual([
        { name: 'Dark Elf Lineman', externalIds: [], raceEras: [] },
      ]);
    });

    it('keys an entry by its sorted external ids', async () => {
      await service.availability();
      const keyOf = latestByKeyCall()[1];

      expect(
        keyOf({
          name: 'Lineman',
          externalIds: [{ system: 'Name', id: 'Orc: Lineman' }],
          raceEras: [],
        }),
      ).toBe('Name|Orc: Lineman');
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
      const kept = [{ move: 4 }];
      reader.latestByKey.mockReturnValue(kept);

      await expect(service.characteristics()).resolves.toBe(kept);
    });

    it('shapes an entry, reading an omitted passing as null', async () => {
      reader.section.mockResolvedValue([
        {
          position: { system: 'Name', id: 'Dwarf Team: Dwarf Blocker Linemen' },
          rulesSet: { system: 'Name', id: 'CRP' },
          move: 4,
          strength: 3,
          agility: 2,
          armour: 9,
        },
      ]);

      await service.characteristics();

      expect(latestByKeyCall()[0]).toEqual([
        {
          position: { system: 'Name', id: 'Dwarf Team: Dwarf Blocker Linemen' },
          rulesSet: { system: 'Name', id: 'CRP' },
          move: 4,
          strength: 3,
          agility: 2,
          passing: null,
          armour: 9,
        },
      ]);
    });

    it('keeps an explicit passing value', async () => {
      reader.section.mockResolvedValue([
        {
          position: { system: 'Name', id: 'Some Position' },
          rulesSet: { system: 'Name', id: 'BB2020' },
          move: 6,
          strength: 3,
          agility: 3,
          passing: 2,
          armour: 7,
        },
      ]);

      await service.characteristics();

      expect(latestByKeyCall()[0]).toEqual([
        expect.objectContaining({ passing: 2 }),
      ]);
    });

    it('skips an entry with a missing position or rulesSet ref', async () => {
      reader.section.mockResolvedValue([
        {
          position: { system: 'Name', id: 'Dwarf Blocker Lineman' },
          rulesSet: { system: 'Name', id: 'CRP' },
          move: 4,
        },
        { rulesSet: { system: 'Name', id: 'CRP' }, move: 4 },
        { position: { system: 'Name', id: 'Dwarf Blocker Lineman' }, move: 4 },
      ]);

      await service.characteristics();

      expect(latestByKeyCall()[0]).toHaveLength(1);
    });

    it('keys an entry by its position and rules set', async () => {
      await service.characteristics();
      const keyOf = latestByKeyCall()[1];

      expect(
        keyOf({
          position: { system: 'Name', id: 'Lineman' },
          rulesSet: { system: 'Name', id: 'CRP' },
        }),
      ).toBe('Name|Lineman::Name|CRP');
    });
  });

  describe('positionSkills', () => {
    it("reads the curated batches' positionRulesSetSkills section", async () => {
      await service.positionSkills();

      expect(reader.section).toHaveBeenCalledWith(
        BATCHES_DIR,
        'positionRulesSetSkills',
      );
    });

    it('returns the entries latestByKey keeps', async () => {
      const kept = [{ skills: [] }];
      reader.latestByKey.mockReturnValue(kept);

      await expect(service.positionSkills()).resolves.toBe(kept);
    });

    it('reads plain skill refs, and wrapped ones with an attribute value', async () => {
      reader.section.mockResolvedValue([
        {
          position: {
            system: 'Name',
            id: 'SL - Chaos Halflings: SL - Carvers',
          },
          rulesSet: { system: 'Name', id: 'CRP' },
          skills: [
            { system: 'Name', id: 'Dodge' },
            {
              skill: { system: 'Name', id: 'Secret Weapon' },
              attributeValue: '7+',
            },
          ],
        },
      ]);

      await service.positionSkills();

      expect(latestByKeyCall()[0]).toEqual([
        {
          position: {
            system: 'Name',
            id: 'SL - Chaos Halflings: SL - Carvers',
          },
          rulesSet: { system: 'Name', id: 'CRP' },
          skills: [
            { skill: { system: 'Name', id: 'Dodge' }, attributeValue: null },
            {
              skill: { system: 'Name', id: 'Secret Weapon' },
              attributeValue: '7+',
            },
          ],
        },
      ]);
    });

    it('drops a wrapped skill whose inner ref is invalid, and treats non-array skills as none', async () => {
      reader.section.mockResolvedValue([
        {
          position: { system: 'Name', id: 'A' },
          rulesSet: { system: 'Name', id: 'CRP' },
          skills: [{ skill: { id: 'Secret Weapon' }, attributeValue: '7+' }],
        },
        {
          position: { system: 'Name', id: 'B' },
          rulesSet: { system: 'Name', id: 'CRP' },
          skills: 'not-an-array',
        },
      ]);

      await service.positionSkills();

      expect(latestByKeyCall()[0]).toEqual([
        {
          position: { system: 'Name', id: 'A' },
          rulesSet: { system: 'Name', id: 'CRP' },
          skills: [],
        },
        {
          position: { system: 'Name', id: 'B' },
          rulesSet: { system: 'Name', id: 'CRP' },
          skills: [],
        },
      ]);
    });

    it('drops an entry with no position or rules set ref', async () => {
      reader.section.mockResolvedValue([
        { rulesSet: { system: 'Name', id: 'CRP' }, skills: [] },
      ]);

      await service.positionSkills();

      expect(latestByKeyCall()[0]).toEqual([]);
    });

    it('keys an entry by its position and rules set', async () => {
      await service.positionSkills();
      const keyOf = latestByKeyCall()[1];

      expect(
        keyOf({
          position: { system: 'Name', id: 'Blitzer' },
          rulesSet: { system: 'Name', id: 'CRP' },
          skills: [],
        }),
      ).toBe('Name|Blitzer::Name|CRP');
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
      ]);

      await service.keywords();

      expect(latestByKeyCall()[0]).toEqual([
        {
          key: 'Name|Goblin,tourplay.net|111',
          keyword: { name: 'Goblin', kind: 'species', code: '111' },
        },
      ]);
    });

    it('reads an entry with no tourplay.net id as code: null', async () => {
      reader.section.mockResolvedValue([
        {
          name: 'Big Guy',
          kind: 'positional',
          externalIds: [{ system: 'Name', id: 'Big Guy' }],
        },
      ]);

      await service.keywords();

      expect(latestByKeyCall()[0]).toEqual([
        {
          key: 'Name|Big Guy',
          keyword: { name: 'Big Guy', kind: 'positional', code: null },
        },
      ]);
    });

    it('skips an entry whose name or kind is missing', async () => {
      reader.section.mockResolvedValue([
        { name: 'Goblin', externalIds: [] },
        { kind: 'species', externalIds: [] },
      ]);

      await service.keywords();

      expect(latestByKeyCall()[0]).toEqual([]);
    });

    it('keys an entry by its prepared key', async () => {
      await service.keywords();
      const keyOf = latestByKeyCall()[1];

      expect(keyOf({ key: 'Name|Goblin', keyword: {} })).toBe('Name|Goblin');
    });
  });
});
