import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { LastingReductionInput } from './lasting-reduction.service';
import { LastingReductionService } from './lasting-reduction.service';

const base: LastingReductionInput = {
  characteristic: 'AV',
  format: 'plus',
  value: 9,
  start: 9,
  increases: 0,
};

describe('LastingReductionService', () => {
  let service: LastingReductionService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [LastingReductionService],
    }).compile();
    service = moduleRef.get(LastingReductionService);
  });

  it.each<[string, Partial<LastingReductionInput>, number]>([
    ['unchanged', {}, 0],
    ['AV one worse', { value: 8 }, 1],
    [
      'an MA increase undone',
      {
        characteristic: 'MA',
        format: 'bare',
        value: 6,
        start: 6,
        increases: 1,
      },
      1,
    ],
    [
      'an ST increase kept',
      {
        characteristic: 'ST',
        format: 'bare',
        value: 4,
        start: 3,
        increases: 1,
      },
      0,
    ],
    [
      'AG target one worse under plus',
      { characteristic: 'AG', value: 4, start: 3 },
      1,
    ],
    [
      'PA target improved by its increase',
      { characteristic: 'PA', value: 3, start: 4, increases: 1 },
      0,
    ],
    [
      'PA better than start under plus_zero_legal',
      { characteristic: 'PA', format: 'plus_zero_legal', value: 3, start: 4 },
      0,
    ],
    [
      'bare AG lower is worse',
      { characteristic: 'AG', format: 'bare', value: 2, start: 3 },
      1,
    ],
    ['two AV increases, one undone', { value: 10, start: 9, increases: 2 }, 1],
    ['absent format', { format: 'absent', value: 8 }, 0],
    ['null value', { value: null, increases: 1 }, 0],
    ['null start', { start: null, value: 5 }, 0],
  ])('%s', (_name, overrides, expected) => {
    expect(service.reduction({ ...base, ...overrides })).toBe(expected);
  });
});
