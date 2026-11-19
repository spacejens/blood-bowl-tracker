import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import type { AdvancementStageInput } from './advancement-fill-stage.service';
import { AdvancementFillStageService } from './advancement-fill-stage.service';
import { AdvancementPricingService } from './advancement-pricing.service';
import { CharacteristicChangeService } from './characteristic-change.service';
import { CharacteristicReplayService } from './characteristic-replay.service';
import { CharacteristicValidityService } from './characteristic-validity.service';
import { FeedSkillResolverService } from './feed-skill-resolver.service';
import { FillEntryBuilderService } from './fill-entry-builder.service';
import { candidate, profile, report } from './fill-plan.test-helpers';
import type {
  PricingOutcome,
  SkipReason,
  StatReductionEventRow,
  TeamCompetitionRow,
} from './fill-plan.types';
import { LastingInjuryProofService } from './lasting-injury-proof.service';
import {
  BB2020_COSTS,
  costRows,
  increaseStep,
  skillStep,
} from './pricing.test-helpers';
import { PricingRulesSetsService } from './pricing-rules-sets.service';

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
    reductions: [],
    competitions: [],
    rulesSetNames: ['BB2020'],
    diedAt: null,
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

/** An AV reduction in competition 50, the last his team era played. */
const REDUCTION: StatReductionEventRow = {
  playerId: 1,
  characteristic: 'av',
  competitionId: 50,
  playedAt: '2024-03-01T19:00:00+00:00',
};
const PLAYED: TeamCompetitionRow = {
  playerId: 1,
  competitionId: 50,
  firstPlayedAt: '2024-02-01T19:00:00+00:00',
  lastPlayedAt: '2024-04-01T19:00:00+00:00',
};

/** `stageInput()` for a player whose one reduction certainly lasts. */
function injuredInput(
  overrides: Partial<AdvancementStageInput> = {},
): AdvancementStageInput {
  return stageInput({
    hasStatReduction: true,
    reductions: [REDUCTION],
    competitions: [PLAYED],
    ...overrides,
  });
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
        // Pure and dependency-free, so passed real: the pricing assertions
        // below check the rules sets it builds.
        PricingRulesSetsService,
        // Pure, so passed real: the replay with its pure change service, the
        // dependency-free injury proof, validity and entry builder.
        CharacteristicReplayService,
        CharacteristicChangeService,
        LastingInjuryProofService,
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
        reports: [report(), report()],
      }),
    );

    expect('entry' in decision && decision.entry).toMatchObject({
      characteristics: { ma: 7, st: 3, ag: 2, pa: 4, av: 9 },
      advancements: [{ characteristic: 'MA' }, { characteristic: 'AG' }],
    });
  });

  it('refuses a reported skill that repeats a starting skill with another variant', () => {
    skills.resolve.mockReturnValue([
      skillStep({ skillId: 100, nameId: 'Block', attributeValue: '+1' }),
    ]);

    expect(reasonFor(stageInput())).toBe('duplicate-skill');
  });

  it('skips a player whose position has conflicting access rows for a category', () => {
    const access = {
      positionId: 30,
      rulesSetId: 7,
      category: 'agility' as const,
    };

    expect(
      reasonFor(
        stageInput({
          positionAccess: [
            { ...access, access: 'primary' },
            { ...access, access: 'secondary' },
          ],
        }),
      ),
    ).toBe('skill-category-mismatch');
  });

  it('accepts identical duplicate access rows', () => {
    const row = {
      positionId: 30,
      rulesSetId: 7,
      category: 'agility' as const,
      access: 'primary' as const,
    };

    expect(
      reasonFor(stageInput({ positionAccess: [row, row] })),
    ).toBeUndefined();
  });

  it.each<[string, Partial<AdvancementStageInput>, SkipReason]>([
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

  describe('with stat reductions', () => {
    it('fills a player whose reductions certainly last with them applied', () => {
      expect(service.decide(injuredInput())).toEqual({
        entry: {
          player: { system: 'tourplay.net', id: '500' },
          status: 'retired',
          characteristics: { ma: 6, st: 3, ag: 3, pa: 4, av: 8 },
          sppTotal: 8,
          unspentSpp: 2,
          startingSkills: [{ system: 'Name', id: 'Block' }],
          advancements: [
            { skill: { system: 'Name', id: 'Dodge' }, source: 'chosen' },
          ],
        },
      });
    });

    it('skips a player whose reductions may have healed', () => {
      expect(
        reasonFor(
          injuredInput({
            competitions: [
              PLAYED,
              {
                playerId: 1,
                competitionId: 51,
                firstPlayedAt: '2024-04-15T19:00:00+00:00',
                lastPlayedAt: '2024-05-01T19:00:00+00:00',
              },
            ],
          }),
        ),
      ).toBe('lasting-injury-uncertain');
    });

    it('fills a player whose reductions span competitions in an era where they never heal', () => {
      const decision = service.decide(
        injuredInput({
          rulesSetNames: ['CRP'],
          reductions: [
            REDUCTION,
            {
              ...REDUCTION,
              competitionId: 51,
              playedAt: '2024-05-01T19:00:00+00:00',
            },
          ],
          competitions: [
            PLAYED,
            {
              ...PLAYED,
              competitionId: 51,
              firstPlayedAt: '2024-04-15T19:00:00+00:00',
              lastPlayedAt: '2024-06-01T19:00:00+00:00',
            },
          ],
        }),
      );

      expect('entry' in decision && decision.entry.characteristics).toEqual({
        ma: 6,
        st: 3,
        ag: 3,
        pa: 4,
        av: 7,
      });
    });

    it('fills a player who died in the competition of his reductions', () => {
      const decision = service.decide(
        injuredInput({
          diedAt: '2024-03-01T19:00:00+00:00',
          competitions: [
            PLAYED,
            {
              ...PLAYED,
              competitionId: 51,
              firstPlayedAt: '2024-05-01T19:00:00+00:00',
              lastPlayedAt: '2024-06-01T19:00:00+00:00',
            },
          ],
        }),
      );

      expect('entry' in decision && decision.entry.characteristics).toEqual({
        ma: 6,
        st: 3,
        ag: 3,
        pa: 4,
        av: 8,
      });
    });

    it('skips a player with a recorded reduction but no reduction rows', () => {
      expect(reasonFor(injuredInput({ reductions: [] }))).toBe(
        'lasting-injury-uncertain',
      );
    });

    it('reports uncertain injuries before a free-skill risk', () => {
      expect(
        reasonFor(
          injuredInput({
            freeSkillRisk: true,
            reductions: [REDUCTION, { ...REDUCTION, competitionId: 51 }],
            competitions: [PLAYED, { ...PLAYED, competitionId: 51 }],
          }),
        ),
      ).toBe('lasting-injury-uncertain');
    });

    it('applies the other checks to a player whose injuries are proven', () => {
      expect(reasonFor(injuredInput({ freeSkillRisk: true }))).toBe(
        'free-skill-risk',
      );
    });

    describe('with a reported increase', () => {
      beforeEach(() => {
        skills.resolve.mockReturnValue([increaseStep()]);
        pricing.price.mockReturnValue({
          kind: 'priced',
          stepCosts: [18],
          total: 18,
        });
      });

      /** An MA increase reported at `timestamp`, for 18 of his 20 SPP. */
      function increaseInput(
        timestamp: string,
        overrides: Partial<AdvancementStageInput> = {},
      ): AdvancementStageInput {
        return injuredInput({
          candidate: candidate({ sppTotal: 20, unspentSpp: 2 }),
          sppTotal: 20,
          reports: [report({ timestamp })],
          ...overrides,
        });
      }

      it('combines an increase and a later reduction on one characteristic', () => {
        const decision = service.decide(
          increaseInput('2024-02-01T10:00:00+00:00', {
            reductions: [{ ...REDUCTION, characteristic: 'ma' }],
          }),
        );

        expect('entry' in decision && decision.entry).toMatchObject({
          characteristics: { ma: 6, st: 3, ag: 3, pa: 4, av: 9 },
          advancements: [{ characteristic: 'MA' }],
        });
      });

      it('applies an increase and a reduction on different characteristics', () => {
        const decision = service.decide(
          increaseInput('2024-02-01T10:00:00+00:00'),
        );

        expect('entry' in decision && decision.entry).toMatchObject({
          characteristics: { ma: 7, st: 3, ag: 3, pa: 4, av: 8 },
        });
      });

      it('skips a same-day increase and reduction whose order matters', () => {
        expect(
          reasonFor(
            increaseInput('2024-03-01T10:00:00+00:00', {
              reductions: [{ ...REDUCTION, characteristic: 'ma' }],
              profile: profile({ line: { ma: 1, st: 3, ag: 3, pa: 4, av: 9 } }),
            }),
          ),
        ).toBe('characteristic-order-uncertain');
      });
    });

    it('times each increase by its own report', () => {
      // The increase is the second report, posted the day of the MA
      // reduction; reading the first report's time would order them.
      skills.resolve.mockReturnValue([skillStep(), increaseStep()]);
      pricing.price.mockReturnValue({
        kind: 'priced',
        stepCosts: [6, 18],
        total: 24,
      });

      expect(
        reasonFor(
          injuredInput({
            candidate: candidate({ sppTotal: 26, unspentSpp: 2 }),
            sppTotal: 26,
            reports: [
              report({ timestamp: '2024-02-01T10:00:00+00:00' }),
              report({ timestamp: '2024-03-01T10:00:00+00:00' }),
            ],
            reductions: [{ ...REDUCTION, characteristic: 'ma' }],
            profile: profile({ line: { ma: 1, st: 3, ag: 3, pa: 4, av: 9 } }),
          }),
        ),
      ).toBe('characteristic-order-uncertain');
    });
  });

  it('ignores report times when no reduction is recorded', () => {
    skills.resolve.mockReturnValue([increaseStep()]);
    pricing.price.mockReturnValue({
      kind: 'priced',
      stepCosts: [18],
      total: 18,
    });

    const decision = service.decide(
      stageInput({
        candidate: candidate({ sppTotal: 20, unspentSpp: 2 }),
        sppTotal: 20,
        reports: [report({ timestamp: 'not a date' })],
      }),
    );

    expect('entry' in decision && decision.entry).toMatchObject({
      characteristics: { ma: 7, st: 3, ag: 3, pa: 4, av: 9 },
    });
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

      const advancements =
        'entry' in decision ? decision.entry.advancements : [];
      expect(
        advancements.map(
          (advancement) => 'skill' in advancement && advancement.skill.id,
        ),
      ).toEqual(steps.map((step) => step.kind === 'skill' && step.nameId));
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
