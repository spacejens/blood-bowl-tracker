import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import type { AdvancementStageInput } from './advancement-fill-stage.service';
import { AdvancementFillStageService } from './advancement-fill-stage.service';
import { AdvancementPricingService } from './advancement-pricing.service';
import { CharacteristicChangeService } from './characteristic-change.service';
import { CharacteristicValidityService } from './characteristic-validity.service';
import { FeedSkillResolverService } from './feed-skill-resolver.service';
import { FillEntryBuilderService } from './fill-entry-builder.service';
import { candidate, profile, report } from './fill-plan.test-helpers';
import type { PricingOutcome, SkipReason } from './fill-plan.types';
import {
  BB2020_COSTS,
  costRows,
  increaseStep,
  skillStep,
} from './pricing.test-helpers';

/** Chosen primary Dodge for 6 of his 8 SPP, 2 unspent, under rules set 7. */
function stageInput(
  overrides: Partial<AdvancementStageInput> = {},
): AdvancementStageInput {
  return {
    candidate: candidate({ sppTotal: 8, unspentSpp: 2 }),
    sppTotal: 8,
    status: 'retired',
    reports: [report()],
    hasStatReduction: false,
    freeSkillRisk: false,
    stored: [],
    profile: profile(),
    skillNames: [{ skillId: 200, skillName: 'Dodge', nameId: 'Dodge' }],
    rulesSetIds: [7],
    costs: costRows(BB2020_COSTS),
    skillCategories: [{ skillId: 200, rulesSetId: 7, category: 'agility' }],
    positionAccess: [
      { positionId: 30, rulesSetId: 7, category: 'agility', access: 'primary' },
    ],
    ...overrides,
  };
}

describe('AdvancementFillStageService', () => {
  let service: AdvancementFillStageService;
  let skills: MockProxy<FeedSkillResolverService>;
  let pricing: MockProxy<AdvancementPricingService>;

  beforeEach(async () => {
    skills = mock<FeedSkillResolverService>();
    pricing = mock<AdvancementPricingService>();
    skills.resolve.mockReturnValue([skillStep()]);
    pricing.price.mockReturnValue({ kind: 'priced', stepCosts: [6], total: 6 });
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdvancementFillStageService,
        { provide: FeedSkillResolverService, useValue: skills },
        { provide: AdvancementPricingService, useValue: pricing },
        // Pure and dependency-free, so passed real.
        CharacteristicChangeService,
        CharacteristicValidityService,
        FillEntryBuilderService,
      ],
    }).compile();
    service = moduleRef.get(AdvancementFillStageService);
  });

  function reasonFor(input: AdvancementStageInput): SkipReason | undefined {
    const decision = service.decide(input);
    return 'reason' in decision ? decision.reason : undefined;
  }

  it('fills the player with his reported advancements and stored SPP', () => {
    expect(service.decide(stageInput())).toEqual({
      entry: {
        player: { system: 'tourplay.net', id: '500' },
        status: 'retired',
        characteristics: { ma: 6, st: 3, ag: 3, pa: 4, av: 9 },
        sppTotal: 8,
        unspentSpp: 2,
        startingSkills: [{ system: 'Name', id: 'Block' }],
        advancements: [
          { skill: { system: 'Name', id: 'Dodge' }, source: 'chosen' },
        ],
      },
    });
  });

  it('resolves the reports against the Name ids', () => {
    const input = stageInput();
    service.decide(input);

    expect(skills.resolve).toHaveBeenCalledWith({
      reports: input.reports,
      skillNames: input.skillNames,
    });
  });

  it('prices under each rules set of the era with that rules set rows only', () => {
    service.decide(
      stageInput({
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
    );

    expect(pricing.price).toHaveBeenCalledWith({
      steps: [skillStep()],
      rulesSets: [
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
      ],
    });
  });

  it('writes a variant and a random source', () => {
    skills.resolve.mockReturnValue([
      skillStep({
        skillId: 300,
        skillName: 'Mighty Blow',
        nameId: 'Mighty Blow',
        attributeValue: '+1',
        selection: 'random',
      }),
    ]);

    const decision = service.decide(stageInput());

    expect('entry' in decision && decision.entry.advancements).toEqual([
      {
        skill: { system: 'Name', id: 'Mighty Blow' },
        attributeValue: '+1',
        source: 'random',
      },
    ]);
  });

  it('applies each increase to the line and lists it', () => {
    skills.resolve.mockReturnValue([
      increaseStep(),
      increaseStep({ characteristic: 'ag', reportedCost: 20 }),
    ]);
    pricing.price.mockReturnValue({
      kind: 'priced',
      stepCosts: [18, 20],
      total: 38,
    });

    const decision = service.decide(
      stageInput({
        candidate: candidate({ sppTotal: 40, unspentSpp: 2 }),
        sppTotal: 40,
      }),
    );

    expect('entry' in decision && decision.entry).toMatchObject({
      characteristics: { ma: 7, st: 3, ag: 2, pa: 4, av: 9 },
      advancements: [{ characteristic: 'MA' }, { characteristic: 'AG' }],
    });
  });

  it('accepts a reported skill that repeats a starting skill with another variant', () => {
    skills.resolve.mockReturnValue([
      skillStep({ skillId: 100, nameId: 'Block', attributeValue: '+1' }),
    ]);

    expect(reasonFor(stageInput())).toBeUndefined();
  });

  it.each<[string, Partial<AdvancementStageInput>, SkipReason]>([
    [
      'a recorded stat reduction',
      { hasStatReduction: true },
      'advancement-and-injury',
    ],
    [
      'a stat reduction and a free-skill risk',
      { hasStatReduction: true, freeSkillRisk: true },
      'advancement-and-injury',
    ],
    ['a free-skill risk', { freeSkillRisk: true }, 'free-skill-risk'],
    [
      'no stored unspent SPP',
      { candidate: candidate({ sppTotal: 8, unspentSpp: null }) },
      'unspent-spp-missing',
    ],
    [
      'unspent SPP above the total',
      { candidate: candidate({ sppTotal: 8, unspentSpp: 9 }) },
      'spp-does-not-add-up',
    ],
    [
      'negative unspent SPP',
      { candidate: candidate({ sppTotal: 8, unspentSpp: -1 }) },
      'spp-does-not-add-up',
    ],
    [
      'seven reports',
      { reports: Array.from({ length: 7 }, () => report()) },
      'too-many-advancements',
    ],
    ['an ambiguous position', { profile: undefined }, 'position-ambiguous'],
    [
      'a stored MA other than the line',
      { candidate: candidate({ sppTotal: 8, unspentSpp: 2, move: 5 }) },
      'stored-data-contradicts',
    ],
  ])('skips %s', (_name, overrides, reason) => {
    expect(reasonFor(stageInput(overrides))).toBe(reason);
  });

  it('skips a player whose reports do not resolve', () => {
    skills.resolve.mockReturnValue(undefined);

    expect(reasonFor(stageInput())).toBe('skill-unresolved');
  });

  it.each(['Loner', 'Hatred'])('skips a reported %s', (skillName) => {
    skills.resolve.mockReturnValue([
      skillStep({ skillName, nameId: skillName }),
    ]);

    expect(reasonFor(stageInput())).toBe('free-skill-risk');
  });

  it('skips a reported skill that repeats a starting skill', () => {
    skills.resolve.mockReturnValue([
      skillStep({ skillId: 100, nameId: 'Block' }),
    ]);

    expect(reasonFor(stageInput())).toBe('duplicate-skill');
  });

  it('skips a skill reported twice', () => {
    skills.resolve.mockReturnValue([skillStep(), skillStep()]);

    expect(reasonFor(stageInput())).toBe('duplicate-skill');
    expect(pricing.price).not.toHaveBeenCalled();
  });

  it.each<[string, PricingOutcome, SkipReason]>([
    ['a granted skill', { kind: 'granted-skill' }, 'free-skill-risk'],
    [
      'a contradicted category',
      { kind: 'category-mismatch' },
      'skill-category-mismatch',
    ],
    ['rules sets that disagree', { kind: 'disagree' }, 'rules-sets-disagree'],
    ['an unpriced step', { kind: 'unpriced' }, 'spp-does-not-add-up'],
    [
      'a total other than the spend',
      { kind: 'priced', stepCosts: [8], total: 8 },
      'spp-does-not-add-up',
    ],
    [
      'a step cost other than the reported one',
      { kind: 'priced', stepCosts: [5], total: 6 },
      'feed-cost-mismatch',
    ],
  ])('skips %s', (_name, outcome, reason) => {
    pricing.price.mockReturnValue(outcome);

    expect(reasonFor(stageInput())).toBe(reason);
  });

  it('skips an increase that cannot be applied', () => {
    skills.resolve.mockReturnValue([increaseStep({ characteristic: 'pa' })]);
    pricing.price.mockReturnValue({
      kind: 'priced',
      stepCosts: [18],
      total: 18,
    });

    expect(
      reasonFor(
        stageInput({
          candidate: candidate({ sppTotal: 20, unspentSpp: 2 }),
          sppTotal: 20,
          profile: profile({
            line: { ma: 6, st: 3, ag: 3, pa: null, av: 9 },
            formats: {
              ma: 'bare',
              st: 'bare',
              ag: 'plus',
              pa: 'absent',
              av: 'plus',
            },
          }),
        }),
      ),
    ).toBe('invalid-characteristics');
  });

  it('skips a line that is not valid', () => {
    expect(
      reasonFor(
        stageInput({
          profile: profile({ line: { ma: 6, st: 0, ag: 3, pa: 4, av: 9 } }),
        }),
      ),
    ).toBe('invalid-characteristics');
  });

  describe('boundaries', () => {
    it('fills a player with exactly six reports', () => {
      const steps = Array.from({ length: 6 }, (_unused, at) =>
        skillStep({ skillId: 201 + at, nameId: `Skill ${at}` }),
      );
      skills.resolve.mockReturnValue(steps);
      pricing.price.mockReturnValue({
        kind: 'priced',
        stepCosts: [6, 6, 6, 6, 6, 6],
        total: 36,
      });

      const decision = service.decide(
        stageInput({
          candidate: candidate({ sppTotal: 40, unspentSpp: 4 }),
          sppTotal: 40,
          reports: Array.from({ length: 6 }, () => report()),
        }),
      );

      expect('entry' in decision && decision.entry.advancements).toHaveLength(
        6,
      );
    });

    it('accepts unspent SPP equal to the total, with nothing spent', () => {
      skills.resolve.mockReturnValue([]);
      pricing.price.mockReturnValue({
        kind: 'priced',
        stepCosts: [],
        total: 0,
      });

      expect(
        reasonFor(
          stageInput({
            candidate: candidate({ sppTotal: 8, unspentSpp: 8 }),
            reports: [],
          }),
        ),
      ).toBeUndefined();
    });

    it('accepts no unspent SPP, with everything spent', () => {
      skills.resolve.mockReturnValue([skillStep({ reportedCost: 8 })]);
      pricing.price.mockReturnValue({
        kind: 'priced',
        stepCosts: [8],
        total: 8,
      });

      expect(
        reasonFor(
          stageInput({ candidate: candidate({ sppTotal: 8, unspentSpp: 0 }) }),
        ),
      ).toBeUndefined();
    });
  });

  describe('check order', () => {
    const sevenReports = Array.from({ length: 7 }, () => report());

    it('reports a missing unspent SPP before too many advancements', () => {
      expect(
        reasonFor(
          stageInput({
            candidate: candidate({ sppTotal: 8, unspentSpp: null }),
            reports: sevenReports,
          }),
        ),
      ).toBe('unspent-spp-missing');
    });

    it('reports too many advancements before unresolved skills', () => {
      skills.resolve.mockReturnValue(undefined);

      expect(reasonFor(stageInput({ reports: sevenReports }))).toBe(
        'too-many-advancements',
      );
    });

    it('reports a reported Loner before an ambiguous position', () => {
      skills.resolve.mockReturnValue([
        skillStep({ skillName: 'Loner', nameId: 'Loner' }),
      ]);

      expect(reasonFor(stageInput({ profile: undefined }))).toBe(
        'free-skill-risk',
      );
    });

    it('reports a duplicate skill before a mismatching price', () => {
      skills.resolve.mockReturnValue([
        skillStep({ skillId: 100, nameId: 'Block' }),
      ]);
      pricing.price.mockReturnValue({
        kind: 'priced',
        stepCosts: [5],
        total: 6,
      });

      expect(reasonFor(stageInput())).toBe('duplicate-skill');
    });

    it('reports an invalid line before a stored contradiction', () => {
      expect(
        reasonFor(
          stageInput({
            candidate: candidate({ sppTotal: 8, unspentSpp: 2, move: 5 }),
            profile: profile({ line: { ma: 6, st: 0, ag: 3, pa: 4, av: 9 } }),
          }),
        ),
      ).toBe('invalid-characteristics');
    });
  });

  it('skips a player whose stored advancement is not a starting skill', () => {
    expect(
      reasonFor(
        stageInput({
          stored: [
            {
              playerId: 1,
              source: 'chosen',
              skillId: 200,
              skillName: 'Dodge',
              attributeValue: null,
              isFreeExtra: false,
            },
          ],
        }),
      ),
    ).toBe('stored-data-contradicts');
  });

  it('accepts a stored starting skill the position lists', () => {
    expect(
      reasonFor(
        stageInput({
          stored: [
            {
              playerId: 1,
              source: 'starting',
              skillId: 100,
              skillName: 'Block',
              attributeValue: null,
              isFreeExtra: false,
            },
          ],
        }),
      ),
    ).toBeUndefined();
  });
});
