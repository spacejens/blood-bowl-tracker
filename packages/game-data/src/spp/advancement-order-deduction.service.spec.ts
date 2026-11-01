import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { AdvancementKindCandidatesService } from './advancement-kind-candidates.service';
import { AdvancementOrderDeductionService } from './advancement-order-deduction.service';
import { AdvancementSpendRangeService } from './advancement-spend-range.service';
import type {
  ApplicableAdvancementCost,
  PlayerSkillEntry,
  RulesSetAdvancementInput,
} from './unspent-spp.types';

function costRow(
  advancementNumber: number,
  advancementKind: ApplicableAdvancementCost['advancementKind'],
  sppCost: number,
): ApplicableAdvancementCost {
  return { advancementNumber, advancementKind, skillId: null, sppCost };
}

/** Characteristic increases cost much more than skills, and more at later numbers. */
const COSTS: ApplicableAdvancementCost[] = [
  costRow(1, 'random_primary_skill', 3),
  costRow(1, 'random_characteristic', 18),
  costRow(2, 'random_primary_skill', 4),
  costRow(2, 'random_characteristic', 20),
  costRow(3, 'random_primary_skill', 6),
  costRow(3, 'random_characteristic', 24),
];

/** COSTS with the prices at numbers 2 and 3 swapped between kinds' rows. */
const SWAPPED: ApplicableAdvancementCost[] = [
  costRow(1, 'random_primary_skill', 3),
  costRow(1, 'random_characteristic', 18),
  costRow(2, 'random_primary_skill', 6),
  costRow(2, 'random_characteristic', 24),
  costRow(3, 'random_primary_skill', 4),
  costRow(3, 'random_characteristic', 20),
];

/** The same price at every number, as under fixed thresholds. */
const FLAT: ApplicableAdvancementCost[] = [1, 2, 3].flatMap((n) => [
  costRow(n, 'random_primary_skill', 10),
  costRow(n, 'random_characteristic', 10),
]);

function row(
  id: number,
  overrides: Partial<PlayerSkillEntry> = {},
): PlayerSkillEntry {
  return {
    id,
    skillId: 100 + id,
    source: 'random',
    isFreeExtra: false,
    advancementOrder: null,
    orderConfirmed: false,
    ...overrides,
  };
}

function increaseRow(id: number): PlayerSkillEntry {
  return row(id, { skillId: null, source: 'characteristic' });
}

function rulesSet(
  rows: PlayerSkillEntry[],
  costs: ApplicableAdvancementCost[],
): RulesSetAdvancementInput {
  return {
    rulesSetId: 1,
    pricingModel: 'kind_priced',
    costs,
    candidatesInput: {
      skills: rows,
      skillCategories: new Map(),
      positionAccess: new Map(),
      costs,
    },
  };
}

/** The stored paid advancement every case starts from: a skill confirmed at 1. */
const STORED = row(1, { advancementOrder: 1, orderConfirmed: true });

describe('AdvancementOrderDeductionService', () => {
  let service: AdvancementOrderDeductionService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdvancementOrderDeductionService,
        AdvancementKindCandidatesService,
        AdvancementSpendRangeService,
      ],
    }).compile();
    service = moduleRef.get(AdvancementOrderDeductionService);
  });

  const skillAndIncrease = [STORED, row(2), increaseRow(3)];

  it('returns the only assignment whose cost matches the spend', () => {
    const rulesSets = [rulesSet(skillAndIncrease, COSTS)];

    expect(
      service.deduce({
        rulesSets,
        newRowIds: [2, 3],
        firstNumber: 2,
        spent: 31,
      }),
    ).toEqual(
      new Map([
        [2, 2],
        [3, 3],
      ]),
    );
    expect(
      service.deduce({
        rulesSets,
        newRowIds: [2, 3],
        firstNumber: 2,
        spent: 29,
      }),
    ).toEqual(
      new Map([
        [3, 2],
        [2, 3],
      ]),
    );
  });

  it('returns the fallback order when order does not change cost', () => {
    const rulesSets = [rulesSet([STORED, row(2), row(3)], FLAT)];

    expect(
      service.deduce({
        rulesSets,
        newRowIds: [2, 3],
        firstNumber: 2,
        spent: 30,
      }),
    ).toEqual(
      new Map([
        [2, 2],
        [3, 3],
      ]),
    );
  });

  it('returns nothing when several orders fit at different costs', () => {
    const rulesSets = [
      rulesSet(skillAndIncrease, COSTS),
      rulesSet(skillAndIncrease, SWAPPED),
    ];

    expect(
      service.deduce({
        rulesSets,
        newRowIds: [2, 3],
        firstNumber: 2,
        spent: 31,
      }),
    ).toBeUndefined();
  });

  it('returns nothing when no order fits the spend', () => {
    const rulesSets = [rulesSet(skillAndIncrease, COSTS)];

    expect(
      service.deduce({
        rulesSets,
        newRowIds: [2, 3],
        firstNumber: 2,
        spent: 999,
      }),
    ).toBeUndefined();
  });

  it('returns nothing without a rules set', () => {
    expect(
      service.deduce({
        rulesSets: [],
        newRowIds: [2, 3],
        firstNumber: 2,
        spent: 31,
      }),
    ).toBeUndefined();
  });

  it('returns a lone new advancement at the first number when it fits', () => {
    const rulesSets = [rulesSet([STORED, row(2)], COSTS)];

    expect(
      service.deduce({ rulesSets, newRowIds: [2], firstNumber: 2, spent: 7 }),
    ).toEqual(new Map([[2, 2]]));
  });

  it('returns nothing for a lone new advancement the spend does not allow', () => {
    const rulesSets = [rulesSet([STORED, row(2)], COSTS)];

    expect(
      service.deduce({ rulesSets, newRowIds: [2], firstNumber: 2, spent: 23 }),
    ).toBeUndefined();
  });

  it('returns nothing without new advancements', () => {
    const rulesSets = [rulesSet([STORED], COSTS)];

    expect(
      service.deduce({ rulesSets, newRowIds: [], firstNumber: 2, spent: 3 }),
    ).toBeUndefined();
  });

  it('does not search more than six new advancements', () => {
    const ids = [2, 3, 4, 5, 6, 7, 8];
    // Every order would fit this flat table, so only the cap leaves it unanswered.
    const flatToEight = [1, 2, 3, 4, 5, 6, 7, 8].map((n) =>
      costRow(n, 'random_primary_skill', 10),
    );
    const rulesSets = [
      rulesSet([STORED, ...ids.map((id) => row(id))], flatToEight),
    ];

    expect(
      service.deduce({ rulesSets, newRowIds: ids, firstNumber: 2, spent: 80 }),
    ).toBeUndefined();
  });

  it('returns nothing when the fallback order is not among equal-cost fits', () => {
    // An increase costs 10 at 2 or 3 and 50 at 4, where the fallback puts it.
    const costs = [
      ...[1, 2, 3, 4].map((n) => costRow(n, 'random_primary_skill', 10)),
      costRow(2, 'random_characteristic', 10),
      costRow(3, 'random_characteristic', 10),
      costRow(4, 'random_characteristic', 50),
    ];
    const rulesSets = [
      rulesSet([STORED, row(2), row(3), increaseRow(4)], costs),
    ];

    expect(
      service.deduce({
        rulesSets,
        newRowIds: [2, 3, 4],
        firstNumber: 2,
        spent: 40,
      }),
    ).toBeUndefined();
  });
});
