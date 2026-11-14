import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { CharacteristicReductionService } from './characteristic-reduction.service';
import type {
  CharacteristicFormats,
  CharacteristicLine,
  ReductionCounts,
} from './fill-plan.types';

const BB2020: CharacteristicFormats = {
  ma: 'bare',
  st: 'bare',
  ag: 'plus',
  pa: 'plus_zero_legal',
  av: 'plus',
};
const CRP: CharacteristicFormats = {
  ma: 'bare',
  st: 'bare',
  ag: 'bare',
  pa: 'absent',
  av: 'bare',
};
const LINE: CharacteristicLine = { ma: 6, st: 3, ag: 3, pa: 4, av: 9 };
const NONE: ReductionCounts = { ma: 0, st: 0, ag: 0, pa: 0, av: 0 };

describe('CharacteristicReductionService', () => {
  let service: CharacteristicReductionService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [CharacteristicReductionService],
    }).compile();
    service = moduleRef.get(CharacteristicReductionService);
  });

  it('keeps the position line when there are no reductions', () => {
    expect(
      service.apply({ line: LINE, formats: BB2020, reductions: NONE }),
    ).toEqual(LINE);
  });

  it.each([
    ['ma', { ...LINE, ma: 5 }],
    ['st', { ...LINE, st: 2 }],
    ['av', { ...LINE, av: 8 }],
    ['ag', { ...LINE, ag: 4 }],
    ['pa', { ...LINE, pa: 5 }],
  ] as const)(
    'applies one %s reduction under a target-number rules set',
    (key, expected) => {
      expect(
        service.apply({
          line: LINE,
          formats: BB2020,
          reductions: { ...NONE, [key]: 1 },
        }),
      ).toEqual(expected);
    },
  );

  it('lowers a bare agility, and keeps an absent passing absent', () => {
    expect(
      service.apply({
        line: { ma: 6, st: 3, ag: 3, pa: null, av: 8 },
        formats: CRP,
        reductions: { ...NONE, ag: 1 },
      }),
    ).toEqual({ ma: 6, st: 3, ag: 2, pa: null, av: 8 });
  });

  it('applies several reductions of one kind', () => {
    expect(
      service.apply({
        line: LINE,
        formats: BB2020,
        reductions: { ...NONE, ma: 2 },
      }),
    ).toEqual({ ...LINE, ma: 4 });
  });

  it('refuses a value below 1', () => {
    expect(
      service.apply({
        line: { ...LINE, st: 1 },
        formats: BB2020,
        reductions: { ...NONE, st: 1 },
      }),
    ).toBeUndefined();
  });

  it('refuses a target worse than 6+', () => {
    expect(
      service.apply({
        line: { ...LINE, ag: 6 },
        formats: BB2020,
        reductions: { ...NONE, ag: 1 },
      }),
    ).toBeUndefined();
  });

  it('keeps a structural zero passing, but refuses reducing it', () => {
    const line = { ...LINE, pa: 0 };
    expect(service.apply({ line, formats: BB2020, reductions: NONE })).toEqual(
      line,
    );
    expect(
      service.apply({ line, formats: BB2020, reductions: { ...NONE, pa: 1 } }),
    ).toBeUndefined();
  });

  it('refuses a passing reduction under a rules set with no Passing', () => {
    expect(
      service.apply({
        line: { ...LINE, pa: null },
        formats: CRP,
        reductions: { ...NONE, pa: 1 },
      }),
    ).toBeUndefined();
  });

  it('refuses a passing value the format says is absent, and a missing one it says is present', () => {
    expect(
      service.apply({ line: LINE, formats: CRP, reductions: NONE }),
    ).toBeUndefined();
    expect(
      service.apply({
        line: { ...LINE, pa: null },
        formats: BB2020,
        reductions: NONE,
      }),
    ).toBeUndefined();
  });

  it('refuses an agility the rules set has no format for', () => {
    expect(
      service.apply({
        line: LINE,
        formats: { ...BB2020, ag: 'absent' },
        reductions: NONE,
      }),
    ).toBeUndefined();
  });
});
