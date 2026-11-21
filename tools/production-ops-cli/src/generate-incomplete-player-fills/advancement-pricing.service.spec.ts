import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { AdvancementPricingService } from './advancement-pricing.service';
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
  selection: 'random',
  category: 'secondary',
  reportedCost: 8,
});

describe('AdvancementPricingService', () => {
  let service: AdvancementPricingService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [AdvancementPricingService],
    }).compile();
    service = moduleRef.get(AdvancementPricingService);
  });

  it('prices each step by its kind at its own advancement number', () => {
    expect(
      service.price({
        steps: [skillStep(), GUARD],
        rulesSets: [pricingInput(costRows(BB2020_COSTS))],
      }),
    ).toEqual({ kind: 'priced', stepCosts: [6, 8], total: 14 });
  });

  it('prices a random characteristic increase', () => {
    expect(
      service.price({
        steps: [increaseStep()],
        rulesSets: [pricingInput(costRows(BB2020_COSTS))],
      }),
    ).toEqual({ kind: 'priced', stepCosts: [18], total: 18 });
  });

  it('cannot price a chosen characteristic increase', () => {
    expect(
      service.price({
        steps: [increaseStep({ selection: 'chosen' })],
        rulesSets: [pricingInput(costRows(BB2020_COSTS))],
      }),
    ).toEqual({ kind: 'unpriced' });
  });

  it('cannot price a kind the rules set does not offer', () => {
    expect(
      service.price({
        steps: [GUARD],
        rulesSets: [pricingInput(costRows(BB2025_COSTS))],
      }),
    ).toEqual({ kind: 'unpriced' });
  });

  it('cannot price a seventh advancement', () => {
    const steps = Array.from({ length: 7 }, () =>
      skillStep({ selection: 'random' }),
    );

    expect(
      service.price({
        steps,
        rulesSets: [pricingInput(costRows(BB2020_COSTS))],
      }),
    ).toEqual({ kind: 'unpriced' });
  });

  it('prices every step as a table roll under fixed thresholds, whatever its category', () => {
    expect(
      service.price({
        steps: [
          skillStep(),
          increaseStep(),
          skillStep({ category: 'secondary', selection: 'random' }),
        ],
        rulesSets: [pricingInput(costRows(FIXED_COSTS))],
      }),
    ).toEqual({ kind: 'priced', stepCosts: [6, 10, 15], total: 31 });
  });

  it('decides fixed thresholds from the rules set own rows alone', () => {
    const costs = [
      ...costRows(FIXED_COSTS),
      {
        eraId: 4,
        rulesSetId: 7,
        leagueId: 3,
        advancementNumber: 7,
        advancementKind: 'granted_skill' as const,
        skillId: 999,
        sppCost: 125,
      },
    ];

    expect(
      service.price({ steps: [skillStep()], rulesSets: [pricingInput(costs)] }),
    ).toEqual({ kind: 'priced', stepCosts: [6], total: 6 });
  });

  it('reports a skill that a cost row grants', () => {
    const costs = [
      ...costRows(BB2020_COSTS),
      {
        eraId: 4,
        rulesSetId: 7,
        leagueId: 3,
        advancementNumber: 7,
        advancementKind: 'granted_skill' as const,
        skillId: 200,
        sppCost: 125,
      },
    ];

    expect(
      service.price({ steps: [skillStep()], rulesSets: [pricingInput(costs)] }),
    ).toEqual({ kind: 'granted-skill' });
  });

  it('reports a category the position access contradicts', () => {
    expect(
      service.price({
        steps: [skillStep({ category: 'secondary' })],
        rulesSets: [pricingInput(costRows(BB2020_COSTS))],
      }),
    ).toEqual({ kind: 'category-mismatch' });
  });

  it('prices a skill whose category access is not known by the report', () => {
    expect(
      service.price({
        steps: [skillStep({ category: 'secondary' })],
        rulesSets: [
          pricingInput(costRows(BB2020_COSTS), { positionAccess: new Map() }),
        ],
      }),
    ).toEqual({ kind: 'priced', stepCosts: [12], total: 12 });
  });

  it('agrees when every rules set of the era gives the same costs', () => {
    expect(
      service.price({
        steps: [skillStep(), GUARD],
        rulesSets: [
          pricingInput(costRows(BB2020_COSTS, 7)),
          pricingInput(costRows(BB2020_COSTS, 8), { rulesSetId: 8 }),
        ],
      }),
    ).toEqual({ kind: 'priced', stepCosts: [6, 8], total: 14 });
  });

  it('reports rules sets that price a step differently', () => {
    const guard = skillStep({ skillId: 201, category: 'secondary' });

    expect(
      service.price({
        steps: [guard],
        rulesSets: [
          pricingInput(costRows(BB2020_COSTS, 7)),
          pricingInput(costRows(BB2025_COSTS, 8), { rulesSetId: 8 }),
        ],
      }),
    ).toEqual({ kind: 'disagree' });
  });

  it('reports a rules set that cannot price a step another can', () => {
    expect(
      service.price({
        steps: [GUARD],
        rulesSets: [
          pricingInput(costRows(BB2020_COSTS, 7)),
          pricingInput(costRows(BB2025_COSTS, 8), { rulesSetId: 8 }),
        ],
      }),
    ).toEqual({ kind: 'disagree' });
  });

  it('cannot price without a rules set', () => {
    expect(service.price({ steps: [skillStep()], rulesSets: [] })).toEqual({
      kind: 'unpriced',
    });
  });

  it('cannot price a step that two rows price differently', () => {
    const costs = [
      ...costRows(BB2020_COSTS),
      {
        eraId: 4,
        rulesSetId: 7,
        leagueId: 3,
        advancementNumber: 1,
        advancementKind: 'chosen_primary_skill' as const,
        skillId: null,
        sppCost: 7,
      },
    ];

    expect(
      service.price({ steps: [skillStep()], rulesSets: [pricingInput(costs)] }),
    ).toEqual({ kind: 'unpriced' });
  });

  it('prices a step that two rows price alike', () => {
    const costs = [
      ...costRows(BB2020_COSTS),
      {
        eraId: 4,
        rulesSetId: 7,
        leagueId: 3,
        advancementNumber: 1,
        advancementKind: 'chosen_primary_skill' as const,
        skillId: null,
        sppCost: 6,
      },
    ];

    expect(
      service.price({ steps: [skillStep()], rulesSets: [pricingInput(costs)] }),
    ).toEqual({ kind: 'priced', stepCosts: [6], total: 6 });
  });

  it('prices no steps at nothing', () => {
    expect(
      service.price({
        steps: [],
        rulesSets: [pricingInput(costRows(BB2020_COSTS))],
      }),
    ).toEqual({ kind: 'priced', stepCosts: [], total: 0 });
  });

  describe('hasConflictingCosts', () => {
    const leagueRow = (
      advancementKind: 'random_primary_skill' | 'random_characteristic',
      advancementNumber: number,
    ) => ({
      eraId: 4,
      rulesSetId: 7,
      leagueId: 5,
      advancementNumber,
      advancementKind,
      skillId: null,
      sppCost: 99,
    });

    it('is true when a skill kind at a number up to the maximum has several prices', () => {
      expect(
        service.hasConflictingCosts({
          costs: [
            ...costRows(BB2020_COSTS),
            leagueRow('random_primary_skill', 1),
          ],
          maxNumber: 1,
        }),
      ).toBe(true);
    });

    it('is false for a conflict at a number beyond the maximum', () => {
      expect(
        service.hasConflictingCosts({
          costs: [
            ...costRows(BB2020_COSTS),
            leagueRow('random_primary_skill', 2),
          ],
          maxNumber: 1,
        }),
      ).toBe(false);
    });

    it('is false for a conflict in a kind that is not a skill kind', () => {
      expect(
        service.hasConflictingCosts({
          costs: [
            ...costRows(BB2020_COSTS),
            leagueRow('random_characteristic', 1),
          ],
          maxNumber: 1,
        }),
      ).toBe(false);
    });

    it('is true for conflicting table rolls under fixed thresholds', () => {
      expect(
        service.hasConflictingCosts({
          costs: [
            ...costRows(FIXED_COSTS),
            { ...costRows(FIXED_COSTS)[0], leagueId: 5, sppCost: 99 },
          ],
          maxNumber: 1,
        }),
      ).toBe(true);
    });

    it('is false when every kind and number has one price', () => {
      expect(
        service.hasConflictingCosts({
          costs: costRows(BB2020_COSTS),
          maxNumber: 6,
        }),
      ).toBe(false);
    });
  });
});
