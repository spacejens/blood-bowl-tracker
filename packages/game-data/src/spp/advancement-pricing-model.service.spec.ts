import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { PricedCostRow } from './advancement-pricing-model.service';
import { AdvancementPricingModelService } from './advancement-pricing-model.service';

const CRP = 1;
const BB2020 = 2;

function row(
  rulesSetId: number,
  advancementKind: PricedCostRow['advancementKind'],
  leagueId: number | null = null,
): PricedCostRow {
  return { rulesSetId, leagueId, advancementKind };
}

describe('AdvancementPricingModelService', () => {
  let service: AdvancementPricingModelService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [AdvancementPricingModelService],
    }).compile();
    service = moduleRef.get(AdvancementPricingModelService);
  });

  it('calls a rules set whose own rows are all table rolls fixed-threshold', () => {
    expect(service.modelFor([CRP], [row(CRP, 'table_roll')])).toBe(
      'fixed_threshold',
    );
  });

  it('ignores league rows when deciding the model', () => {
    expect(
      service.modelFor(
        [CRP],
        [row(CRP, 'table_roll'), row(CRP, 'granted_skill', 30)],
      ),
    ).toBe('fixed_threshold');
  });

  it('calls a rules set with any other own row kind-priced', () => {
    expect(
      service.modelFor(
        [BB2020],
        [
          row(BB2020, 'random_primary_skill'),
          row(BB2020, 'chosen_primary_skill'),
        ],
      ),
    ).toBe('kind_priced');
  });

  it('agrees when every rules set of the era has the same model', () => {
    expect(
      service.modelFor(
        [CRP, 3],
        [row(CRP, 'table_roll'), row(3, 'table_roll')],
      ),
    ).toBe('fixed_threshold');
  });

  it('is null when the rules sets disagree', () => {
    expect(
      service.modelFor(
        [CRP, BB2020],
        [row(CRP, 'table_roll'), row(BB2020, 'random_primary_skill')],
      ),
    ).toBeNull();
  });

  it('lets a rules set with no own rows abstain', () => {
    expect(service.modelFor([CRP, BB2020], [row(CRP, 'table_roll')])).toBe(
      'fixed_threshold',
    );
  });

  it('is null when no rules set has own rows', () => {
    expect(service.modelFor([CRP], [row(CRP, 'granted_skill', 30)])).toBeNull();
    expect(service.modelFor([], [])).toBeNull();
  });
});
