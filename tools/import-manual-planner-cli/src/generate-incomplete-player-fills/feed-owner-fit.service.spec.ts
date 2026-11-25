import { ReportedAdvancementPricingService } from '@blood-bowl-tracker/game-rules';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import type { FeedFitInput } from './feed-owner-fit.service';
import { FeedOwnerFitService } from './feed-owner-fit.service';
import { FeedSkillResolverService } from './feed-skill-resolver.service';
import { report } from './fill-plan.test-helpers';
import type { PaidAdvancementRow, PricingOutcome } from './fill-plan.types';
import {
  BB2020_COSTS,
  costRows,
  increaseStep,
  pricingInput,
  skillStep,
} from './pricing.test-helpers';

const NAMES = [{ skillId: 200, skillName: 'Dodge', nameId: 'Dodge' }];
const PAID_DODGE: PaidAdvancementRow = {
  playerId: 1,
  skillId: 200,
  attributeValue: null,
  characteristic: null,
};
const PAID_MA: PaidAdvancementRow = {
  playerId: 1,
  skillId: null,
  attributeValue: null,
  characteristic: 'ma',
};

/** One chosen primary Dodge at 6, owned by a player who spent 6 of 8 SPP. */
function fitInput(overrides: Partial<FeedFitInput> = {}): FeedFitInput {
  return {
    owner: {
      playerId: 1,
      sppTotal: 8,
      unspentSpp: 2,
      rulesSets: [pricingInput(costRows(BB2020_COSTS))],
      paid: [],
      isIncomplete: false,
    },
    reports: [report()],
    skillNames: NAMES,
    ...overrides,
  };
}

describe('FeedOwnerFitService', () => {
  let service: FeedOwnerFitService;
  let skills: MockProxy<FeedSkillResolverService>;
  let pricing: MockProxy<ReportedAdvancementPricingService>;

  beforeEach(async () => {
    skills = mock<FeedSkillResolverService>();
    pricing = mock<ReportedAdvancementPricingService>();
    skills.resolve.mockReturnValue([skillStep()]);
    pricing.price.mockReturnValue({ kind: 'priced', stepCosts: [6], total: 6 });
    const moduleRef = await Test.createTestingModule({
      providers: [
        FeedOwnerFitService,
        { provide: FeedSkillResolverService, useValue: skills },
        { provide: ReportedAdvancementPricingService, useValue: pricing },
      ],
    }).compile();
    service = moduleRef.get(FeedOwnerFitService);
  });

  it('accepts reports priced at their shown costs that add up to the SPP he spent', () => {
    const input = fitInput();

    expect(service.fit(input)).toBe('valid');
    expect(skills.resolve).toHaveBeenCalledWith({
      reports: input.reports,
      skillNames: NAMES,
    });
    expect(pricing.price).toHaveBeenCalledWith({
      steps: [skillStep()],
      rulesSets: input.owner.rulesSets,
    });
  });

  it('accepts no reports without checking anything', () => {
    expect(service.fit(fitInput({ reports: [] }))).toBe('valid');
    expect(skills.resolve).not.toHaveBeenCalled();
  });

  it('refuses more than six reports', () => {
    expect(service.fit(fitInput({ reports: Array(7).fill(report()) }))).toBe(
      'invalid',
    );
  });

  it.each([
    ['his total', { sppTotal: null }],
    ['his unspent SPP', { unspentSpp: null }],
  ])('cannot decide when %s is not stored', (_name, owner) => {
    expect(
      service.fit(fitInput({ owner: { ...fitInput().owner, ...owner } })),
    ).toBe('unknown');
  });

  it('cannot decide when a report does not resolve', () => {
    skills.resolve.mockReturnValue(undefined);

    expect(service.fit(fitInput())).toBe('unknown');
  });

  it.each<PricingOutcome>([
    { kind: 'granted-skill' },
    { kind: 'category-mismatch' },
    { kind: 'disagree' },
    { kind: 'unpriced' },
  ])('cannot decide when pricing gives $kind', (outcome) => {
    pricing.price.mockReturnValue(outcome);

    expect(service.fit(fitInput())).toBe('unknown');
  });

  it('refuses a report whose shown cost is below its price, which no earlier report missing from the feed explains', () => {
    pricing.price.mockReturnValue({ kind: 'priced', stepCosts: [8], total: 8 });

    expect(
      service.fit(fitInput({ owner: { ...fitInput().owner, sppTotal: 10 } })),
    ).toBe('invalid');
  });

  it('cannot decide when a shown cost is above its price and the shown costs fall short of the SPP he spent, since the feed may lack an earlier report', () => {
    pricing.price.mockReturnValue({ kind: 'priced', stepCosts: [4], total: 4 });

    expect(
      service.fit(fitInput({ owner: { ...fitInput().owner, unspentSpp: 0 } })),
    ).toBe('unknown');
  });

  it('cannot decide when a shown cost is above its price and the shown costs add up to the SPP he spent', () => {
    pricing.price.mockReturnValue({ kind: 'priced', stepCosts: [4], total: 4 });

    expect(service.fit(fitInput())).toBe('unknown');
  });

  it('refuses a shown cost above its price when the shown costs exceed the SPP he spent, though the prices do not', () => {
    pricing.price.mockReturnValue({ kind: 'priced', stepCosts: [4], total: 4 });

    expect(
      service.fit(
        fitInput({
          owner: {
            ...fitInput().owner,
            unspentSpp: 4,
            paid: [PAID_DODGE, PAID_MA],
          },
        }),
      ),
    ).toBe('invalid');
  });

  it('refuses a shown cost above its price when the report is not among his stored paid advancements', () => {
    pricing.price.mockReturnValue({ kind: 'priced', stepCosts: [4], total: 4 });

    expect(
      service.fit(
        fitInput({ owner: { ...fitInput().owner, paid: [PAID_MA] } }),
      ),
    ).toBe('invalid');
  });

  it('refuses reports when one shown cost is below its price, even if another is above', () => {
    skills.resolve.mockReturnValue([skillStep(), increaseStep()]);
    pricing.price.mockReturnValue({
      kind: 'priced',
      stepCosts: [4, 20],
      total: 24,
    });

    expect(
      service.fit(
        fitInput({
          owner: { ...fitInput().owner, sppTotal: 30 },
          reports: [report(), report()],
        }),
      ),
    ).toBe('invalid');
  });

  it('refuses a shown cost above its price when even the prices exceed the SPP he spent', () => {
    pricing.price.mockReturnValue({ kind: 'priced', stepCosts: [4], total: 4 });

    expect(
      service.fit(fitInput({ owner: { ...fitInput().owner, unspentSpp: 5 } })),
    ).toBe('invalid');
  });

  it('refuses prices above the SPP he spent', () => {
    expect(
      service.fit(fitInput({ owner: { ...fitInput().owner, unspentSpp: 4 } })),
    ).toBe('invalid');
  });

  it('cannot decide when the prices are below the SPP he spent and no paid advancements are stored', () => {
    expect(
      service.fit(fitInput({ owner: { ...fitInput().owner, unspentSpp: 0 } })),
    ).toBe('unknown');
  });

  it('cannot decide when the prices are below the SPP he spent and the reports are among his stored paid advancements', () => {
    expect(
      service.fit(
        fitInput({
          owner: {
            ...fitInput().owner,
            unspentSpp: 0,
            paid: [PAID_DODGE, PAID_MA],
          },
        }),
      ),
    ).toBe('unknown');
  });

  it('refuses a report that is not among his stored paid advancements when the prices are below the SPP he spent', () => {
    expect(
      service.fit(
        fitInput({
          owner: { ...fitInput().owner, unspentSpp: 0, paid: [PAID_MA] },
        }),
      ),
    ).toBe('invalid');
  });

  it('refuses a report given more often than he stored it when the prices are below the SPP he spent', () => {
    skills.resolve.mockReturnValue([skillStep(), skillStep()]);
    pricing.price.mockReturnValue({
      kind: 'priced',
      stepCosts: [6, 6],
      total: 12,
    });

    expect(
      service.fit(
        fitInput({
          owner: {
            ...fitInput().owner,
            sppTotal: 20,
            unspentSpp: 2,
            paid: [PAID_DODGE, PAID_MA],
          },
          reports: [report(), report()],
        }),
      ),
    ).toBe('invalid');
  });

  it('accepts reports that are exactly his stored paid advancements, in any order', () => {
    skills.resolve.mockReturnValue([skillStep(), increaseStep()]);
    pricing.price.mockReturnValue({
      kind: 'priced',
      stepCosts: [6, 18],
      total: 24,
    });

    expect(
      service.fit(
        fitInput({
          owner: {
            ...fitInput().owner,
            sppTotal: 26,
            paid: [PAID_MA, PAID_DODGE],
          },
          reports: [report(), report()],
        }),
      ),
    ).toBe('valid');
  });

  it.each([
    ['another skill', [{ ...PAID_DODGE, skillId: 201 }]],
    ['another variant', [{ ...PAID_DODGE, attributeValue: '+1' }]],
    ['one more advancement', [PAID_DODGE, PAID_MA]],
  ])(
    'refuses reports when his stored paid advancements hold %s',
    (_name, paid) => {
      expect(
        service.fit(fitInput({ owner: { ...fitInput().owner, paid } })),
      ).toBe('invalid');
    },
  );

  describe('for an incomplete owner, whose stored paid advancements may be partial', () => {
    it.each([
      ['another skill', [{ ...PAID_DODGE, skillId: 201 }]],
      ['one more advancement', [PAID_DODGE, PAID_MA]],
    ])(
      'cannot decide when the prices add up to the SPP he spent and his stored paid advancements hold %s',
      (_name, paid) => {
        expect(
          service.fit(
            fitInput({
              owner: { ...fitInput().owner, paid, isIncomplete: true },
            }),
          ),
        ).toBe('unknown');
      },
    );

    it('cannot decide when the prices are below the SPP he spent and a report is not among his stored paid advancements', () => {
      expect(
        service.fit(
          fitInput({
            owner: {
              ...fitInput().owner,
              unspentSpp: 0,
              paid: [PAID_MA],
              isIncomplete: true,
            },
          }),
        ),
      ).toBe('unknown');
    });

    it('still accepts reports that are exactly his stored paid advancements', () => {
      expect(
        service.fit(
          fitInput({
            owner: {
              ...fitInput().owner,
              paid: [PAID_DODGE],
              isIncomplete: true,
            },
          }),
        ),
      ).toBe('valid');
    });

    it('still refuses prices above the SPP he spent', () => {
      expect(
        service.fit(
          fitInput({
            owner: {
              ...fitInput().owner,
              unspentSpp: 4,
              paid: [PAID_MA],
              isIncomplete: true,
            },
          }),
        ),
      ).toBe('invalid');
    });
  });
});
