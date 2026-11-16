import type { RulesSetAdvancementInput } from '@blood-bowl-tracker/game-data';
import {
  AdvancementKindCandidatesService,
  AdvancementOrderDeductionService,
  AdvancementSpendRangeService,
} from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { AdvancementPricingService } from './advancement-pricing.service';
import type { ResolvedStep, RulesSetPricingInput } from './fill-plan.types';
import {
  BB2020_COSTS,
  BB2025_COSTS,
  costRows,
  FIXED_COSTS,
  increaseStep,
  pricingInput,
  skillStep,
} from './pricing.test-helpers';

const GUARD = skillStep({
  skillId: 201,
  skillName: 'Guard',
  nameId: 'Guard',
  category: 'secondary',
});

/** The steps as the server's fill spend check reads them, under one rules set. */
function serverInput(
  steps: readonly ResolvedStep[],
  rulesSet: RulesSetPricingInput,
): RulesSetAdvancementInput {
  const costs = rulesSet.costs.map((cost) => ({
    advancementNumber: cost.advancementNumber,
    advancementKind: cost.advancementKind,
    skillId: cost.skillId,
    sppCost: cost.sppCost,
  }));
  return {
    rulesSetId: rulesSet.rulesSetId,
    pricingModel: null,
    costs,
    candidatesInput: {
      skills: steps.map((step, at) => ({
        id: at + 1,
        skillId: step.kind === 'skill' ? step.skillId : null,
        source: step.kind === 'skill' ? step.selection : 'characteristic',
        isFreeExtra: false,
        advancementOrder: null,
        orderConfirmed: false,
      })),
      skillCategories: new Map(rulesSet.skillCategories),
      positionAccess: new Map(rulesSet.positionAccess),
      costs,
    },
  };
}

describe('AdvancementPricingService against game-data', () => {
  let pricing: AdvancementPricingService;
  let deduction: AdvancementOrderDeductionService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdvancementPricingService,
        AdvancementOrderDeductionService,
        AdvancementKindCandidatesService,
        AdvancementSpendRangeService,
      ],
    }).compile();
    pricing = moduleRef.get(AdvancementPricingService);
    deduction = moduleRef.get(AdvancementOrderDeductionService);
  });

  /** Whether the server's check accepts the steps, in this order, at the spend. */
  function serverAccepts(
    steps: readonly ResolvedStep[],
    rulesSets: readonly RulesSetPricingInput[],
    spent: number,
  ): boolean {
    const ids = steps.map((_step, at) => at + 1);
    return (
      deduction.deduce({
        rulesSets: rulesSets.map((rulesSet) => serverInput(steps, rulesSet)),
        newRowIds: ids,
        orderedRowIds: ids,
        firstNumber: 1,
        spent,
      }) !== undefined
    );
  }

  it.each<[string, ResolvedStep[], RulesSetPricingInput[]]>([
    [
      'one chosen primary skill (BB2020)',
      [skillStep()],
      [pricingInput(costRows(BB2020_COSTS))],
    ],
    [
      'random primary, random secondary, chosen secondary (BB2020)',
      [
        skillStep({ selection: 'random' }),
        { ...GUARD, selection: 'random' },
        GUARD,
      ],
      [pricingInput(costRows(BB2020_COSTS))],
    ],
    [
      'a characteristic increase, then a chosen primary skill (BB2025)',
      [increaseStep(), skillStep()],
      [pricingInput(costRows(BB2025_COSTS))],
    ],
    [
      'six random primary skills (BB2020 and DB2021 alike)',
      Array.from({ length: 6 }, () => skillStep({ selection: 'random' })),
      [
        pricingInput(costRows(BB2020_COSTS, 7)),
        pricingInput(costRows(BB2020_COSTS, 8), { rulesSetId: 8 }),
      ],
    ],
    [
      'a skill and an increase under fixed thresholds',
      [skillStep(), increaseStep()],
      [pricingInput(costRows(FIXED_COSTS))],
    ],
  ])(
    'the server accepts exactly the priced spend: %s',
    (_name, steps, rulesSets) => {
      const outcome = pricing.price({ steps, rulesSets });

      expect(outcome.kind).toBe('priced');
      const total = outcome.kind === 'priced' ? outcome.total : -1;
      expect(serverAccepts(steps, rulesSets, total)).toBe(true);
      expect(serverAccepts(steps, rulesSets, total - 1)).toBe(false);
      expect(serverAccepts(steps, rulesSets, total + 1)).toBe(false);
    },
  );

  it('agrees with the server that BB2025 has no random secondary skill', () => {
    const steps = [{ ...GUARD, selection: 'random' as const }];
    const rulesSets = [pricingInput(costRows(BB2025_COSTS))];

    expect(pricing.price({ steps, rulesSets })).toEqual({ kind: 'unpriced' });
    for (let spent = 0; spent <= 60; spent++) {
      expect(serverAccepts(steps, rulesSets, spent)).toBe(false);
    }
  });
});
