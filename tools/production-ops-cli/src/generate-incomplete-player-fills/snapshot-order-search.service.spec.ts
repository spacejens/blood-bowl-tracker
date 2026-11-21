import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { AdvancementPricingService } from './advancement-pricing.service';
import {
  BB2020_COSTS,
  BB2025_COSTS,
  costRows,
  FIXED_COSTS,
  pricingInput,
} from './pricing.test-helpers';
import { SnapshotOrderSearchService } from './snapshot-order-search.service';

const DODGE = { skillId: 200, skillName: 'Dodge', nameId: 'Dodge' };
const GUARD = { skillId: 201, skillName: 'Guard', nameId: 'Guard' };
const SPRINT = { skillId: 202, skillName: 'Sprint', nameId: 'Sprint' };

function step(
  skill: { skillId: number; skillName: string; nameId: string },
  rest: {
    selection: 'chosen' | 'random';
    category: 'primary' | 'secondary';
    reportedCost: number;
  },
) {
  return { kind: 'skill', ...skill, attributeValue: null, ...rest };
}

describe('SnapshotOrderSearchService', () => {
  let service: SnapshotOrderSearchService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        SnapshotOrderSearchService,
        // Pure and dependency-free, so passed real: the search is only
        // meaningful against real prices.
        AdvancementPricingService,
      ],
    }).compile();
    service = moduleRef.get(SnapshotOrderSearchService);
  });

  const bb2020 = [pricingInput(costRows(BB2020_COSTS))];

  it('fills no advancements only for a spend of 0', () => {
    expect(service.search({ skills: [], rulesSets: bb2020, spent: 0 })).toEqual(
      { kind: 'unique', steps: [] },
    );
    expect(service.search({ skills: [], rulesSets: bb2020, spent: 3 })).toEqual(
      { kind: 'none' },
    );
  });

  it('settles one skill as chosen or random by its cost', () => {
    expect(
      service.search({ skills: [DODGE], rulesSets: bb2020, spent: 6 }),
    ).toEqual({
      kind: 'unique',
      steps: [
        step(DODGE, {
          selection: 'chosen',
          category: 'primary',
          reportedCost: 6,
        }),
      ],
    });
    expect(
      service.search({ skills: [DODGE], rulesSets: bb2020, spent: 3 }),
    ).toEqual({
      kind: 'unique',
      steps: [
        step(DODGE, {
          selection: 'random',
          category: 'primary',
          reportedCost: 3,
        }),
      ],
    });
  });

  it('finds no fit when no order and assignment costs the spend', () => {
    expect(
      service.search({ skills: [DODGE], rulesSets: bb2020, spent: 5 }),
    ).toEqual({ kind: 'none' });
  });

  it('settles the order of a primary and a secondary skill the spend allows only one way', () => {
    // Random primary Dodge at 1 (3) + random secondary Guard at 2 (8) = 11.
    expect(
      service.search({ skills: [GUARD, DODGE], rulesSets: bb2020, spent: 11 }),
    ).toEqual({
      kind: 'unique',
      steps: [
        step(DODGE, {
          selection: 'random',
          category: 'primary',
          reportedCost: 3,
        }),
        step(GUARD, {
          selection: 'random',
          category: 'secondary',
          reportedCost: 8,
        }),
      ],
    });
  });

  it('leaves two skills of the same kind ambiguous, since either order fits', () => {
    const rulesSets = [
      pricingInput(costRows(BB2020_COSTS), {
        skillCategories: new Map([
          [200, 'agility'],
          [202, 'agility'],
        ]),
      }),
    ];

    // Random primary at 1 (3) + random primary at 2 (4) = 7, in either order.
    expect(
      service.search({ skills: [DODGE, SPRINT], rulesSets, spent: 7 }),
    ).toEqual({ kind: 'ambiguous' });
  });

  it('leaves a skill under fixed thresholds ambiguous, since chosen and random cost the same', () => {
    expect(
      service.search({
        skills: [DODGE],
        rulesSets: [pricingInput(costRows(FIXED_COSTS))],
        spent: 6,
      }),
    ).toEqual({ kind: 'ambiguous' });
  });

  it('reports a skill whose category the position has no access to', () => {
    expect(
      service.search({
        skills: [{ skillId: 999, skillName: 'X', nameId: 'X' }],
        rulesSets: bb2020,
        spent: 6,
      }),
    ).toEqual({ kind: 'category-mismatch' });
  });

  it('reports a skill the rules sets put on different sides of primary and secondary', () => {
    const rulesSets = [
      pricingInput(costRows(BB2020_COSTS)),
      pricingInput(costRows(BB2020_COSTS, 8), {
        rulesSetId: 8,
        positionAccess: new Map([['agility', 'secondary']]),
      }),
    ];

    expect(service.search({ skills: [DODGE], rulesSets, spent: 6 })).toEqual({
      kind: 'category-mismatch',
    });
  });

  it('reports a skill a cost row grants', () => {
    const granted = {
      ...costRows(BB2020_COSTS)[0],
      advancementKind: 'granted_skill' as const,
      skillId: 200,
    };

    expect(
      service.search({
        skills: [DODGE],
        rulesSets: [pricingInput([...costRows(BB2020_COSTS), granted])],
        spent: 6,
      }),
    ).toEqual({ kind: 'granted-skill' });
  });

  it('reports rules sets that price the same steps differently', () => {
    const dearer = costRows(BB2020_COSTS, 8).map((row) => ({
      ...row,
      sppCost: row.sppCost + 1,
    }));

    expect(
      service.search({
        skills: [DODGE],
        rulesSets: [
          pricingInput(costRows(BB2020_COSTS)),
          pricingInput(dearer, { rulesSetId: 8 }),
        ],
        spent: 6,
      }),
    ).toEqual({ kind: 'disagree' });
  });

  describe('rows that price one kind and number differently', () => {
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

    it('reports disagreement, not a skipped candidate, for a kind and number the search touches', () => {
      const rulesSets = [
        pricingInput([
          ...costRows(BB2020_COSTS),
          leagueRow('random_primary_skill', 1),
        ]),
      ];

      expect(service.search({ skills: [DODGE], rulesSets, spent: 6 })).toEqual({
        kind: 'disagree',
      });
    });

    it('ignores conflicting rows of a number or kind the search cannot reach', () => {
      const rulesSets = [
        pricingInput([
          ...costRows(BB2020_COSTS),
          leagueRow('random_primary_skill', 2),
          leagueRow('random_characteristic', 1),
        ]),
      ];

      expect(
        service.search({ skills: [DODGE], rulesSets, spent: 6 }),
      ).toMatchObject({ kind: 'unique' });
    });

    it('reports disagreement for conflicting table rolls under fixed thresholds', () => {
      const rulesSets = [
        pricingInput([
          ...costRows(FIXED_COSTS),
          { ...costRows(FIXED_COSTS)[0], leagueId: 5, sppCost: 99 },
        ]),
      ];

      expect(service.search({ skills: [DODGE], rulesSets, spent: 6 })).toEqual({
        kind: 'disagree',
      });
    });
  });

  it('skips a candidate with no cost row and can still settle the rest', () => {
    // BB2025 has no random secondary skill, so Guard can only be chosen.
    const rulesSets = [pricingInput(costRows(BB2025_COSTS))];

    // Random primary Dodge at 1 (3) + chosen secondary Guard at 2 (12) = 15.
    expect(
      service.search({ skills: [DODGE, GUARD], rulesSets, spent: 15 }),
    ).toEqual({
      kind: 'unique',
      steps: [
        step(DODGE, {
          selection: 'random',
          category: 'primary',
          reportedCost: 3,
        }),
        step(GUARD, {
          selection: 'chosen',
          category: 'secondary',
          reportedCost: 12,
        }),
      ],
    });
  });

  it('leaves a primary and a secondary skill ambiguous when each order has one fit', () => {
    // Dodge first (chosen, 6) then Guard (random secondary at 2, 8) = 14;
    // Guard first (random secondary at 1, 6) then Dodge (chosen at 2, 8) = 14.
    expect(
      service.search({ skills: [DODGE, GUARD], rulesSets: bb2020, spent: 14 }),
    ).toEqual({ kind: 'ambiguous' });
  });
});
