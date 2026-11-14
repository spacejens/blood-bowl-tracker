import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { CharacteristicReductionService } from './characteristic-reduction.service';
import { candidate, eligibleInput, profile } from './fill-plan.test-helpers';
import type { FillPlannerInput, SkipReason } from './fill-plan.types';
import { IncompletePlayerFillPlannerService } from './incomplete-player-fill-planner.service';
import { PositionProfileService } from './position-profile.service';

describe('IncompletePlayerFillPlannerService', () => {
  let service: IncompletePlayerFillPlannerService;
  let reduction: MockProxy<CharacteristicReductionService>;
  let profiles: MockProxy<PositionProfileService>;

  beforeEach(async () => {
    reduction = mock<CharacteristicReductionService>();
    profiles = mock<PositionProfileService>();
    profiles.resolve.mockReturnValue(profile());
    // Canned: the unreduced position line. The reduction rules themselves
    // are covered by characteristic-reduction.service.spec.ts.
    reduction.apply.mockReturnValue(profile().line);
    const moduleRef = await Test.createTestingModule({
      providers: [
        IncompletePlayerFillPlannerService,
        { provide: CharacteristicReductionService, useValue: reduction },
        { provide: PositionProfileService, useValue: profiles },
      ],
    }).compile();
    service = moduleRef.get(IncompletePlayerFillPlannerService);
  });

  /** The one reason the only candidate was skipped for, or undefined if filled. */
  function reasonFor(input: FillPlannerInput): SkipReason | undefined {
    const skipped = Object.entries(service.plan(input).report.skipped).find(
      ([, tally]) => tally.count > 0,
    );
    return skipped?.[0] as SkipReason | undefined;
  }

  it('fills an eligible player from his position, with his whole total unspent', () => {
    const plan = service.plan(eligibleInput());

    expect(plan.entries).toEqual([
      {
        player: { system: 'tourplay.net', id: '500' },
        status: 'retired',
        characteristics: { ma: 6, st: 3, ag: 3, pa: 4, av: 9 },
        sppTotal: 5,
        unspentSpp: 5,
        startingSkills: [{ system: 'Name', id: 'Block' }],
        advancements: [],
      },
    ]);
    expect(plan.report.considered).toBe(1);
    expect(plan.report.eligible).toBe(1);
  });

  it('hands the position rows and their skills to the profile decision', () => {
    const input = eligibleInput();
    service.plan(input);

    expect(profiles.resolve).toHaveBeenCalledWith({
      rows: input.positionRulesSets,
      skills: input.positionSkills,
    });
  });

  it('writes a variant starting skill with its attribute value', () => {
    profiles.resolve.mockReturnValue(
      profile({
        skills: [{ skillId: 102, nameId: 'Loner', attributeValue: '4+' }],
      }),
    );

    expect(service.plan(eligibleInput()).entries[0].startingSkills).toEqual([
      { skill: { system: 'Name', id: 'Loner' }, attributeValue: '4+' },
    ]);
  });

  it('leaves pa out when the rules set has no Passing', () => {
    reduction.apply.mockReturnValue({ ma: 6, st: 3, ag: 3, pa: null, av: 8 });

    expect(service.plan(eligibleInput()).entries[0].characteristics).toEqual({
      ma: 6,
      st: 3,
      ag: 3,
      av: 8,
    });
  });

  it('keeps a structural zero passing', () => {
    reduction.apply.mockReturnValue({ ma: 6, st: 3, ag: 3, pa: 0, av: 9 });

    expect(service.plan(eligibleInput()).entries[0].characteristics.pa).toBe(0);
  });

  it('counts the stat reductions his match events record, ignoring other consequences', () => {
    service.plan(
      eligibleInput({
        consequenceCounts: [
          { playerId: 1, consequenceType: 'stat_reduction_ma', count: 2 },
          { playerId: 1, consequenceType: 'stat_reduction_ag', count: 1 },
          { playerId: 1, consequenceType: 'niggling_injury', count: 3 },
          { playerId: 2, consequenceType: 'stat_reduction_st', count: 1 },
        ],
      }),
    );

    expect(reduction.apply).toHaveBeenCalledWith({
      line: profile().line,
      formats: profile().formats,
      reductions: { ma: 2, st: 0, ag: 1, pa: 0, av: 0 },
    });
  });

  it('fills a player with zero SPP', () => {
    const plan = service.plan(
      eligibleInput({ candidates: [candidate({ sppTotal: 0 })] }),
    );

    expect(plan.entries[0]).toMatchObject({ sppTotal: 0, unspentSpp: 0 });
  });

  it.each<[string, Partial<FillPlannerInput>, SkipReason]>([
    [
      'a journeyman',
      { candidates: [candidate({ isJourneyman: true })] },
      'journeyman',
    ],
    [
      'a missing total',
      { candidates: [candidate({ sppTotal: null })] },
      'spp-missing',
    ],
    [
      'a negative total',
      { candidates: [candidate({ sppTotal: -1 })] },
      'spp-missing',
    ],
    ['an era with no rules set', { eraRulesSets: [] }, 'era-unpriced'],
    [
      'an era with an unpriced rules set',
      {
        eraRulesSets: [
          { eraId: 4, rulesSetId: 7, cheapestCost: 6 },
          { eraId: 4, rulesSetId: 8, cheapestCost: null },
        ],
      },
      'era-unpriced',
    ],
    [
      'a total exactly at the cheapest cost',
      { candidates: [candidate({ sppTotal: 6 })] },
      'spp-too-high',
    ],
    [
      'a total at the cheapest cost of another rules set of the era',
      {
        eraRulesSets: [
          { eraId: 4, rulesSetId: 7, cheapestCost: 6 },
          { eraId: 4, rulesSetId: 8, cheapestCost: 5 },
        ],
      },
      'spp-too-high',
    ],
    [
      'a trophy that can grant a skill',
      { freeSkillRiskPlayerIds: [1] },
      'free-skill-risk',
    ],
    [
      'a stored gained Loner',
      {
        storedAdvancements: [
          {
            playerId: 1,
            source: 'advancement',
            skillId: 9,
            skillName: 'Loner',
            attributeValue: '4+',
            isFreeExtra: false,
          },
        ],
      },
      'free-skill-risk',
    ],
    [
      'a stored free extra',
      {
        storedAdvancements: [
          {
            playerId: 1,
            source: 'chosen',
            skillId: 9,
            skillName: 'Tentacles',
            attributeValue: null,
            isFreeExtra: true,
          },
        ],
      },
      'free-skill-risk',
    ],
    [
      'a stored paid skill',
      {
        storedAdvancements: [
          {
            playerId: 1,
            source: 'chosen',
            skillId: 9,
            skillName: 'Dodge',
            attributeValue: null,
            isFreeExtra: false,
          },
        ],
      },
      'stored-data-contradicts',
    ],
    [
      'a stored characteristic increase',
      {
        storedAdvancements: [
          {
            playerId: 1,
            source: 'characteristic',
            skillId: null,
            skillName: null,
            attributeValue: null,
            isFreeExtra: false,
          },
        ],
      },
      'stored-data-contradicts',
    ],
    [
      'a stored starting skill the position does not list',
      {
        storedAdvancements: [
          {
            playerId: 1,
            source: 'starting',
            skillId: 9,
            skillName: 'Dodge',
            attributeValue: null,
            isFreeExtra: false,
          },
        ],
      },
      'stored-data-contradicts',
    ],
    [
      'a stored movement that differs',
      { candidates: [candidate({ move: 7 })] },
      'stored-data-contradicts',
    ],
    [
      'a stored passing that differs',
      { candidates: [candidate({ passing: 3 })] },
      'stored-data-contradicts',
    ],
    [
      'a stored unspent SPP below the total',
      { candidates: [candidate({ unspentSpp: 2 })] },
      'stored-data-contradicts',
    ],
    [
      'a team in an ongoing competition',
      { ongoingTeamIds: [20] },
      'status-unresolved',
    ],
  ])('skips %s', (_label, overrides, reason) => {
    expect(reasonFor(eligibleInput(overrides))).toBe(reason);
  });

  it('skips a player whose position is ambiguous', () => {
    profiles.resolve.mockReturnValue(undefined);

    expect(reasonFor(eligibleInput())).toBe('position-ambiguous');
  });

  it('skips a player whose reduced characteristics are invalid', () => {
    reduction.apply.mockReturnValue(undefined);

    expect(reasonFor(eligibleInput())).toBe('invalid-characteristics');
  });

  it('accepts stored data that equals the entry', () => {
    const plan = service.plan(
      eligibleInput({
        candidates: [
          candidate({
            move: 6,
            strength: 3,
            agility: 3,
            passing: 4,
            armour: 9,
            unspentSpp: 5,
          }),
        ],
        storedAdvancements: [
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
    );

    expect(plan.report.eligible).toBe(1);
  });

  it('keeps a stored status', () => {
    const plan = service.plan(
      eligibleInput({
        candidates: [candidate({ status: 'active' })],
        ongoingTeamIds: [20],
      }),
    );

    expect(plan.entries[0].status).toBe('active');
  });

  it('marks a player dead when his match events record a death', () => {
    const plan = service.plan(
      eligibleInput({
        consequenceCounts: [
          { playerId: 1, consequenceType: 'death', count: 1 },
        ],
        ongoingTeamIds: [20],
      }),
    );

    expect(plan.entries[0].status).toBe('dead');
  });

  it('reports every reason, with the skipped players in TP id order', () => {
    const plan = service.plan(
      eligibleInput({
        candidates: [
          candidate({ playerId: 3, tpId: '1000', sppTotal: null }),
          candidate({ playerId: 2, tpId: '90', sppTotal: null }),
          candidate({ playerId: 1, tpId: '500' }),
        ],
      }),
    );

    expect(plan.report.considered).toBe(3);
    expect(plan.report.skipped['spp-missing']).toEqual({
      count: 2,
      players: ['90', '1000'],
    });
    expect(plan.report.skipped.journeyman).toEqual({ count: 0, players: [] });
    expect(Object.keys(plan.report.skipped)).toHaveLength(9);
  });

  it('orders entries by numeric TP id', () => {
    const plan = service.plan(
      eligibleInput({
        candidates: [
          candidate({ playerId: 1, tpId: '1000' }),
          candidate({ playerId: 2, tpId: '90' }),
        ],
      }),
    );

    expect(plan.entries.map((entry) => entry.player.id)).toEqual([
      '90',
      '1000',
    ]);
  });
});
