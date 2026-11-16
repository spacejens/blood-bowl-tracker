import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { CharacteristicChangeService } from './characteristic-change.service';
import type {
  CharacteristicFormats,
  CharacteristicKey,
  CharacteristicLine,
  ReductionCounts,
} from './fill-plan.types';

const LINE: CharacteristicLine = { ma: 6, st: 3, ag: 3, pa: 4, av: 9 };
const TARGET: CharacteristicFormats = {
  ma: 'bare',
  st: 'bare',
  ag: 'plus',
  pa: 'plus_zero_legal',
  av: 'plus',
};
const BARE_LINE: CharacteristicLine = { ma: 6, st: 3, ag: 3, pa: null, av: 8 };
const BARE: CharacteristicFormats = {
  ma: 'bare',
  st: 'bare',
  ag: 'bare',
  pa: 'absent',
  av: 'bare',
};
const NONE: ReductionCounts = { ma: 0, st: 0, ag: 0, pa: 0, av: 0 };

describe('CharacteristicChangeService', () => {
  let service: CharacteristicChangeService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [CharacteristicChangeService],
    }).compile();
    service = moduleRef.get(CharacteristicChangeService);
  });

  describe('improve', () => {
    it.each<[CharacteristicKey, CharacteristicLine]>([
      ['ma', { ...LINE, ma: 7 }],
      ['st', { ...LINE, st: 4 }],
      ['av', { ...LINE, av: 10 }],
    ])('raises %s by one', (characteristic, expected) => {
      expect(
        service.improve({ line: LINE, formats: TARGET, characteristic }),
      ).toEqual(expected);
    });

    it('lowers a target-number AG by one', () => {
      expect(
        service.improve({ line: LINE, formats: TARGET, characteristic: 'ag' }),
      ).toEqual({ ...LINE, ag: 2 });
    });

    it('lowers a target-number PA by one', () => {
      expect(
        service.improve({ line: LINE, formats: TARGET, characteristic: 'pa' }),
      ).toEqual({ ...LINE, pa: 3 });
    });

    it('raises a bare AG by one', () => {
      expect(
        service.improve({
          line: BARE_LINE,
          formats: BARE,
          characteristic: 'ag',
        }),
      ).toEqual({ ...BARE_LINE, ag: 4 });
    });

    it('cannot improve a target number past 1+', () => {
      expect(
        service.improve({
          line: { ...LINE, ag: 1 },
          formats: TARGET,
          characteristic: 'ag',
        }),
      ).toBeUndefined();
    });

    it('cannot improve a structural zero PA', () => {
      expect(
        service.improve({
          line: { ...LINE, pa: 0 },
          formats: TARGET,
          characteristic: 'pa',
        }),
      ).toBeUndefined();
    });

    it('cannot improve PA under a rules set without Passing', () => {
      expect(
        service.improve({
          line: BARE_LINE,
          formats: BARE,
          characteristic: 'pa',
        }),
      ).toBeUndefined();
    });

    it('leaves the given line untouched', () => {
      const line = { ...LINE };
      service.improve({ line, formats: TARGET, characteristic: 'ma' });

      expect(line).toEqual(LINE);
    });
  });

  describe('reduce', () => {
    it('returns the line unchanged without reductions', () => {
      expect(
        service.reduce({ line: LINE, formats: TARGET, reductions: NONE }),
      ).toEqual(LINE);
    });

    it('lowers MA, ST and AV by one each', () => {
      expect(
        service.reduce({
          line: LINE,
          formats: TARGET,
          reductions: { ...NONE, ma: 1, st: 1, av: 1 },
        }),
      ).toEqual({ ...LINE, ma: 5, st: 2, av: 8 });
    });

    it('raises a target-number AG and PA by one each', () => {
      expect(
        service.reduce({
          line: LINE,
          formats: TARGET,
          reductions: { ...NONE, ag: 1, pa: 1 },
        }),
      ).toEqual({ ...LINE, ag: 4, pa: 5 });
    });

    it('lowers a bare AG by one', () => {
      expect(
        service.reduce({
          line: BARE_LINE,
          formats: BARE,
          reductions: { ...NONE, ag: 1 },
        }),
      ).toEqual({ ...BARE_LINE, ag: 2 });
    });

    it('applies at most two reductions to one characteristic', () => {
      expect(
        service.reduce({
          line: LINE,
          formats: TARGET,
          reductions: { ...NONE, ma: 3 },
        }),
      ).toEqual({ ...LINE, ma: 4 });
    });

    it('stops MA at 1', () => {
      expect(
        service.reduce({
          line: { ...LINE, ma: 2 },
          formats: TARGET,
          reductions: { ...NONE, ma: 2 },
        }),
      ).toEqual({ ...LINE, ma: 1 });
    });

    it('stops a target-number AG at 6+', () => {
      expect(
        service.reduce({
          line: { ...LINE, ag: 5 },
          formats: TARGET,
          reductions: { ...NONE, ag: 2 },
        }),
      ).toEqual({ ...LINE, ag: 6 });
    });

    it('stops a target-number AV at 3+', () => {
      expect(
        service.reduce({
          line: { ...LINE, av: 4 },
          formats: TARGET,
          reductions: { ...NONE, av: 2 },
        }),
      ).toEqual({ ...LINE, av: 3 });
    });

    it('stops a bare AV at 1', () => {
      expect(
        service.reduce({
          line: { ...BARE_LINE, av: 2 },
          formats: BARE,
          reductions: { ...NONE, av: 2 },
        }),
      ).toEqual({ ...BARE_LINE, av: 1 });
    });

    it('leaves a structural zero PA alone', () => {
      expect(
        service.reduce({
          line: { ...LINE, pa: 0 },
          formats: TARGET,
          reductions: { ...NONE, pa: 1 },
        }),
      ).toEqual({ ...LINE, pa: 0 });
    });

    it('leaves an absent PA alone', () => {
      expect(
        service.reduce({
          line: BARE_LINE,
          formats: BARE,
          reductions: { ...NONE, pa: 1 },
        }),
      ).toEqual(BARE_LINE);
    });
  });
});
