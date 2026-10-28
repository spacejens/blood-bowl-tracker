import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { TpSkillCategoryMaskDecoderService } from './tp-skill-category-mask-decoder.service';

describe('TpSkillCategoryMaskDecoderService', () => {
  let decoder: TpSkillCategoryMaskDecoderService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TpSkillCategoryMaskDecoderService],
    }).compile();
    decoder = moduleRef.get(TpSkillCategoryMaskDecoderService);
  });

  it.each([
    [1, ['agility']],
    [2, ['general']],
    [4, ['mutation']],
    [8, ['passing']],
    [16, ['strength']],
    [128, ['devious']],
  ])('decodes bit %i alone', (mask, expected) => {
    expect(decoder.decode(mask)).toEqual(expected);
  });

  it('decodes a zero mask to no categories', () => {
    expect(decoder.decode(0)).toEqual([]);
  });

  it('decodes combined bits in ascending bit order', () => {
    // Human Lineman secondary (17) and Goblin Bruiser primary (129).
    expect(decoder.decode(17)).toEqual(['agility', 'strength']);
    expect(decoder.decode(129)).toEqual(['agility', 'devious']);
    expect(decoder.decode(159)).toEqual([
      'agility',
      'general',
      'mutation',
      'passing',
      'strength',
      'devious',
    ]);
  });

  it.each([32, 64, 256, 2 | 32])(
    'rejects mask %i, which sets a bit with no known category',
    (mask) => {
      expect(() => decoder.decode(mask)).toThrow(
        /TP skill category mask \d+ sets unknown bit/,
      );
    },
  );

  it('names every unknown bit', () => {
    expect(() => decoder.decode(2 | 32 | 64)).toThrow(
      'TP skill category mask 98 sets unknown bit(s) 32, 64',
    );
  });

  it('rejects a negative mask', () => {
    expect(() => decoder.decode(-1)).toThrow(/unknown bit/);
  });
});
