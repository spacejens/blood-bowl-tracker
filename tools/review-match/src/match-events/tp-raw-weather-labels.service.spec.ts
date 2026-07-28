import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { TpRawWeatherLabelsService } from './tp-raw-weather-labels.service';

/**
 * Restated here by hand, on purpose: this spec pins review-match's own
 * weather table, so it must not be driven off the service's internal map
 * (which would make the test agree with any future typo) nor off
 * `packages/parse-tp`'s table (which this tool must stay independent of).
 */
const expectations: readonly (readonly [number, number, string])[] = [
  [0, 0, '0 (dungeon)'],
  [0, 10, '10 (sweltering heat)'],
  [0, 20, '20 (very sunny)'],
  [0, 30, '30 (nice)'],
  [0, 40, '40 (pouring rain)'],
  [0, 50, '50 (blizzard)'],
  [0, 100, '100 (morning dew)'],
  [0, 101, '101 (blossoming flowers)'],
  [0, 102, '102 (misty morning)'],
  [0, 103, '103 (high winds)'],
  [0, 104, '104 (perfect conditions)'],
  [0, 105, '105 (melting astrogranite)'],
  [0, 106, '106 (blinding rays)'],
  [0, 107, '107 (monsoon)'],
  [0, 108, '108 (leaf-strewn pitch)'],
  [0, 109, '109 (autumnal chill)'],
  [0, 110, '110 (strong winds)'],
  [0, 111, '111 (cold winds)'],
  [0, 112, '112 (freezing)'],
  [0, 113, '113 (heavy snow)'],
  [13, 40, '40 (very sunny)'],
  [13, 104, '104 (perfect conditions)'],
  [13, 131, '131 (sweltering heat)'],
  [13, 132, '132 (pouring rain)'],
  [13, 133, '133 (blizzard)'],
];

describe('TpRawWeatherLabelsService', () => {
  let service: TpRawWeatherLabelsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TpRawWeatherLabelsService],
    }).compile();
    service = moduleRef.get(TpRawWeatherLabelsService);
  });

  it.each(expectations)(
    'describes table %s code %s as %s',
    (table, code, expected) => {
      expect(service.describe(table, code)).toBe(expected);
    },
  );

  it('shows the bare code for a code the known table has no label for', () => {
    expect(service.describe(0, 999)).toBe('999');
  });

  it('shows the bare code for any code on an entirely unknown table', () => {
    // Table 13 reuses table 0's numbers, so falling back to table 0 for an
    // unknown table would print a confidently wrong condition.
    expect(service.describe(99, 0)).toBe('0');
  });

  it('does not read a code from the wrong table', () => {
    expect(service.describe(13, 10)).toBe('10');
  });
});
