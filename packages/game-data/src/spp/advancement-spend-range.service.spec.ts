import type { AdvancementKind } from '@blood-bowl-tracker/domain-enums';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { AdvancementSpendRangeService } from './advancement-spend-range.service';
import type {
  AdvancementOption,
  ApplicableAdvancementCost,
} from './unspent-spp.types';

function costs(
  advancementKind: AdvancementKind,
  sppCosts: number[],
): ApplicableAdvancementCost[] {
  return sppCosts.map((sppCost, index) => ({
    advancementNumber: index + 1,
    advancementKind,
    skillId: null,
    sppCost,
  }));
}

const FIXED = costs('table_roll', [6, 10, 15, 20, 25, 100]);
const BY_KIND = [
  ...costs('random_primary_skill', [3, 4, 6, 8, 10, 15]),
  ...costs('chosen_primary_skill', [6, 8, 12, 16, 20, 30]),
  ...costs('random_secondary_skill', [6, 8, 12, 16, 20, 30]),
  ...costs('chosen_secondary_skill', [12, 14, 18, 22, 26, 40]),
  ...costs('random_characteristic', [18, 20, 24, 28, 32, 50]),
];
const FAN_FAVOURITE: ApplicableAdvancementCost = {
  advancementNumber: 7,
  advancementKind: 'granted_skill',
  skillId: 500,
  sppCost: 125,
};

function anyNumber(...kinds: AdvancementKind[]): AdvancementOption[] {
  return kinds.map((advancementKind) => ({
    advancementKind,
    advancementNumber: null,
  }));
}

const ANY_SKILL = anyNumber(
  'random_primary_skill',
  'chosen_primary_skill',
  'random_secondary_skill',
  'chosen_secondary_skill',
);
const GRANTED_AT_7: AdvancementOption[] = [
  { advancementKind: 'granted_skill', advancementNumber: 7 },
];

describe('AdvancementSpendRangeService', () => {
  let service: AdvancementSpendRangeService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [AdvancementSpendRangeService],
    }).compile();
    service = moduleRef.get(AdvancementSpendRangeService);
  });

  describe('range', () => {
    it('spends nothing when no advancement was gained', () => {
      expect(service.range([], FIXED)).toEqual({ spentMin: 0, spentMax: 0 });
    });

    it('is exact under fixed thresholds', () => {
      const options = [
        anyNumber('table_roll'),
        anyNumber('table_roll'),
        anyNumber('table_roll'),
      ];

      expect(service.range(options, FIXED)).toEqual({
        spentMin: 31,
        spentMax: 31,
      });
    });

    it('spans the cheapest and dearest kinds when the kind is unknown', () => {
      expect(service.range([ANY_SKILL, ANY_SKILL], BY_KIND)).toEqual({
        spentMin: 7,
        spentMax: 26,
      });
    });

    it('spans the possible orders when the order is unknown', () => {
      // Random primary first: 3 + 20 = 23. Characteristic first: 18 + 4 = 22.
      const options = [
        anyNumber('random_primary_skill'),
        anyNumber('random_characteristic'),
      ];

      expect(service.range(options, BY_KIND)).toEqual({
        spentMin: 22,
        spentMax: 23,
      });
    });

    it('holds an advancement with a fixed number to that number', () => {
      const options: AdvancementOption[][] = [
        ...Array.from({ length: 6 }, () => anyNumber('table_roll')),
        GRANTED_AT_7,
      ];

      expect(service.range(options, [...FIXED, FAN_FAVOURITE])).toEqual({
        spentMin: 301,
        spentMax: 301,
      });
    });

    it('finds no fit when a fixed number lies beyond the advancements gained', () => {
      const options = [anyNumber('table_roll'), GRANTED_AT_7];

      expect(service.range(options, [...FIXED, FAN_FAVOURITE])).toBeNull();
    });

    it('finds no fit when more advancements were gained than the table prices', () => {
      const options = Array.from({ length: 7 }, () => anyNumber('table_roll'));

      expect(service.range(options, FIXED)).toBeNull();
    });

    it('finds no fit when an advancement has no option at all', () => {
      expect(service.range([[]], FIXED)).toBeNull();
    });

    it('finds no fit when no option is priced at any free number', () => {
      expect(
        service.range([anyNumber('random_characteristic')], FIXED),
      ).toBeNull();
    });

    describe('with a very long cost table', () => {
      function pricedUpTo(count: number): {
        options: AdvancementOption[][];
        table: ApplicableAdvancementCost[];
      } {
        return {
          options: Array.from({ length: count }, () => anyNumber('table_roll')),
          table: costs(
            'table_roll',
            Array.from({ length: count }, (_, index) => index + 1),
          ),
        };
      }

      it('still prices the most advancements it supports', () => {
        const { options, table } = pricedUpTo(16);

        expect(service.range(options, table)).toEqual({
          spentMin: 136,
          spentMax: 136,
        });
      });

      it('finds no fit beyond the most advancements it supports', () => {
        const { options, table } = pricedUpTo(17);

        expect(service.range(options, table)).toBeNull();
      });

      it('finds no fit rather than overflowing the number set', () => {
        const { options, table } = pricedUpTo(32);

        expect(service.range(options, table)).toBeNull();
      });
    });
  });

  describe('cheapestCostAt', () => {
    it('is the cheapest kind at that number', () => {
      expect(service.cheapestCostAt(BY_KIND, 3)).toBe(6);
    });

    it('is null when the table has no such number', () => {
      expect(service.cheapestCostAt(FIXED, 7)).toBeNull();
    });
  });

  describe('canSpendExactly', () => {
    const PRIMARY = anyNumber('random_primary_skill', 'chosen_primary_skill');
    const SECONDARY = anyNumber(
      'random_secondary_skill',
      'chosen_secondary_skill',
    );

    it('spends exactly nothing when no advancement was gained', () => {
      expect(service.canSpendExactly([], FIXED, 0)).toBe(true);
      expect(service.canSpendExactly([], FIXED, 3)).toBe(false);
    });

    it('is true for every total some assignment reaches', () => {
      for (const spent of [10, 11, 14, 16, 17, 20]) {
        expect(
          service.canSpendExactly([PRIMARY, SECONDARY], BY_KIND, spent),
        ).toBe(true);
      }
    });

    it('is false for a total inside the range that no assignment reaches', () => {
      expect(service.range([PRIMARY, SECONDARY], BY_KIND)).toEqual({
        spentMin: 10,
        spentMax: 20,
      });
      for (const spent of [12, 13, 15, 18, 19]) {
        expect(
          service.canSpendExactly([PRIMARY, SECONDARY], BY_KIND, spent),
        ).toBe(false);
      }
    });

    it('is false when a number the advancements need is not priced', () => {
      const sevenRolls = Array.from({ length: 7 }, () =>
        anyNumber('table_roll'),
      );

      expect(service.canSpendExactly(sevenRolls, FIXED, 176)).toBe(false);
    });

    it('is false when an advancement has no priced option', () => {
      expect(
        service.canSpendExactly(
          [anyNumber('random_characteristic')],
          FIXED,
          18,
        ),
      ).toBe(false);
    });

    it('honours a granted skill fixed to its own number', () => {
      const sixRolls = Array.from({ length: 6 }, () => anyNumber('table_roll'));

      expect(
        service.canSpendExactly(
          [...sixRolls, GRANTED_AT_7],
          [...FIXED, FAN_FAVOURITE],
          301,
        ),
      ).toBe(true);
    });

    it('prices the most advancements it supports and no more', () => {
      const rolls = (count: number) =>
        Array.from({ length: count }, () => anyNumber('table_roll'));
      const table = (count: number) =>
        costs(
          'table_roll',
          Array.from({ length: count }, (_, index) => index + 1),
        );

      expect(service.canSpendExactly(rolls(16), table(16), 136)).toBe(true);
      expect(service.canSpendExactly(rolls(17), table(17), 153)).toBe(false);
    });
  });

  describe('pinned options', () => {
    const costs: ApplicableAdvancementCost[] = [
      {
        advancementNumber: 1,
        advancementKind: 'random_characteristic',
        skillId: null,
        sppCost: 18,
      },
      {
        advancementNumber: 1,
        advancementKind: 'random_primary_skill',
        skillId: null,
        sppCost: 3,
      },
      {
        advancementNumber: 1,
        advancementKind: 'chosen_primary_skill',
        skillId: null,
        sppCost: 6,
      },
      {
        advancementNumber: 2,
        advancementKind: 'random_characteristic',
        skillId: null,
        sppCost: 30,
      },
      {
        advancementNumber: 2,
        advancementKind: 'random_primary_skill',
        skillId: null,
        sppCost: 4,
      },
      {
        advancementNumber: 2,
        advancementKind: 'chosen_primary_skill',
        skillId: null,
        sppCost: 8,
      },
    ];
    const skill: AdvancementOption[] = [
      { advancementKind: 'random_primary_skill', advancementNumber: null },
      { advancementKind: 'chosen_primary_skill', advancementNumber: null },
    ];
    const increaseAt = (
      advancementNumber: number | null,
    ): AdvancementOption[] => [
      { advancementKind: 'random_characteristic', advancementNumber },
    ];

    it('tries every number for an unpinned increase', () => {
      expect(service.range([increaseAt(null), skill], costs)).toEqual({
        spentMin: 22,
        spentMax: 36,
      });
    });

    it('holds an increase pinned to number 1 there', () => {
      expect(service.range([increaseAt(1), skill], costs)).toEqual({
        spentMin: 22,
        spentMax: 26,
      });
    });

    it('holds an increase pinned to number 2 there', () => {
      expect(service.range([increaseAt(2), skill], costs)).toEqual({
        spentMin: 33,
        spentMax: 36,
      });
    });
  });
});
