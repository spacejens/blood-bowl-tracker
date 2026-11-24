import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { BB2020_COSTS, costRows } from './pricing.test-helpers';
import { PricingRulesSetsService } from './pricing-rules-sets.service';

describe('PricingRulesSetsService', () => {
  let service: PricingRulesSetsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [PricingRulesSetsService],
    }).compile();
    service = moduleRef.get(PricingRulesSetsService);
  });

  it('gives each rules set its own costs, skill categories and access', () => {
    expect(
      service.build({
        rulesSetIds: [7, 8],
        costs: [...costRows(BB2020_COSTS, 7), ...costRows(BB2020_COSTS, 8)],
        skillCategories: [
          { skillId: 200, rulesSetId: 7, category: 'agility' },
          { skillId: 200, rulesSetId: 8, category: 'general' },
        ],
        positionAccess: [
          {
            positionId: 30,
            rulesSetId: 7,
            category: 'agility',
            access: 'primary',
          },
          {
            positionId: 30,
            rulesSetId: 8,
            category: 'general',
            access: 'secondary',
          },
        ],
      }),
    ).toEqual([
      {
        rulesSetId: 7,
        costs: costRows(BB2020_COSTS, 7),
        skillCategories: new Map([[200, 'agility']]),
        positionAccess: new Map([['agility', 'primary']]),
      },
      {
        rulesSetId: 8,
        costs: costRows(BB2020_COSTS, 8),
        skillCategories: new Map([[200, 'general']]),
        positionAccess: new Map([['general', 'secondary']]),
      },
    ]);
  });

  it('gives no rules set for an era with none', () => {
    expect(
      service.build({
        rulesSetIds: [],
        costs: costRows(BB2020_COSTS),
        skillCategories: [],
        positionAccess: [],
      }),
    ).toEqual([]);
  });

  describe('hasConflictingAccess', () => {
    const row = (access: 'primary' | 'secondary', rulesSetId = 7) => ({
      positionId: 30,
      rulesSetId,
      category: 'agility' as const,
      access,
    });

    it('finds a category one rules set gives two accesses', () => {
      expect(
        service.hasConflictingAccess([row('primary'), row('secondary')]),
      ).toBe(true);
    });

    it('accepts identical duplicates and different rules sets', () => {
      expect(
        service.hasConflictingAccess([
          row('primary'),
          row('primary'),
          row('secondary', 8),
        ]),
      ).toBe(false);
    });
  });
});
