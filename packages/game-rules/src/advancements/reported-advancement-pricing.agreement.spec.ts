import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { AdvancementKindCandidatesService } from './advancement-kind-candidates.service';
import { AdvancementSpendRangeService } from './advancement-spend-range.service';
import { ReportedAdvancementPricingService } from './reported-advancement-pricing.service';
import {
  BB2020_COSTS,
  BB2025_COSTS,
  costRows,
  FIXED_COSTS,
  increaseStep,
  pricingInput,
  skillStep,
} from './reported-pricing.test-helpers';
import type {
  ReportedStep,
  RulesSetPricingInput,
} from './reported-pricing.types';

const GUARD = skillStep({ skillId: 201, category: 'secondary' });

describe('ReportedAdvancementPricingService against the server order check', () => {
  let pricing: ReportedAdvancementPricingService;
  let candidates: AdvancementKindCandidatesService;
  let spendRange: AdvancementSpendRangeService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReportedAdvancementPricingService,
        AdvancementKindCandidatesService,
        AdvancementSpendRangeService,
      ],
    }).compile();
    pricing = moduleRef.get(ReportedAdvancementPricingService);
    candidates = moduleRef.get(AdvancementKindCandidatesService);
    spendRange = moduleRef.get(AdvancementSpendRangeService);
  });

  /** Whether the server accepts the steps, pinned in this order, at the spend under some rules set. */
  function serverAccepts(
    steps: readonly ReportedStep[],
    rulesSets: readonly RulesSetPricingInput[],
    spent: number,
  ): boolean {
    return rulesSets.some((rulesSet) => {
      const costs = rulesSet.costs.map(
        ({ advancementNumber, advancementKind, skillId, sppCost }) => ({
          advancementNumber,
          advancementKind,
          skillId,
          sppCost,
        }),
      );
      const options = candidates.candidates({
        skills: steps.map((step, at) => ({
          id: at + 1,
          skillId: step.kind === 'skill' ? step.skillId : null,
          source: step.kind === 'skill' ? step.selection : 'characteristic',
          isFreeExtra: false,
          advancementOrder: at + 1,
          orderConfirmed: true,
        })),
        skillCategories: rulesSet.skillCategories,
        positionAccess: rulesSet.positionAccess,
        costs,
      });
      return spendRange.canSpendExactly(options, costs, spent);
    });
  }

  it.each<[string, ReportedStep[], RulesSetPricingInput[]]>([
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
        pricingInput(costRows(BB2020_COSTS)),
        pricingInput(costRows(BB2020_COSTS), { rulesSetId: 8 }),
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
