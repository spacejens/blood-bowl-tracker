import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { AdvancementFillStageService } from './advancement-fill-stage.service';
import { CharacteristicValidityService } from './characteristic-validity.service';
import { FeedPlayerMatcherService } from './feed-player-matcher.service';
import { FillEntryBuilderService } from './fill-entry-builder.service';
import {
  candidate,
  eligibleInput,
  profile,
  report,
  teamPlayer,
} from './fill-plan.test-helpers';
import {
  type FeedSummary,
  type FillEntry,
  type FillPlannerInput,
  SKIP_REASONS,
  type SkipReason,
} from './fill-plan.types';
import { IncompletePlayerFillPlannerService } from './incomplete-player-fill-planner.service';
import { InjuryFillStageService } from './injury-fill-stage.service';
import { PositionProfileService } from './position-profile.service';

const SUMMARY: FeedSummary = {
  reportKeys: 1,
  matchedKeys: 1,
  ambiguousKeys: 0,
  unmatchedKeys: 0,
};
const FEED = { Firestarters: { '#13 Flame (Gnoblar Lineman)': [report()] } };
const STAGED: FillEntry = {
  player: { system: 'tourplay.net', id: '500' },
  status: 'retired',
  characteristics: { ma: 6, st: 3, ag: 3, pa: 4, av: 9 },
  sppTotal: 8,
  unspentSpp: 2,
  startingSkills: [],
  advancements: [{ characteristic: 'MA' }],
};

describe('IncompletePlayerFillPlannerService', () => {
  let service: IncompletePlayerFillPlannerService;
  let validity: MockProxy<CharacteristicValidityService>;
  let profiles: MockProxy<PositionProfileService>;
  let matcher: MockProxy<FeedPlayerMatcherService>;
  let advancementStage: MockProxy<AdvancementFillStageService>;
  let injuryStage: MockProxy<InjuryFillStageService>;

  beforeEach(async () => {
    validity = mock<CharacteristicValidityService>();
    profiles = mock<PositionProfileService>();
    matcher = mock<FeedPlayerMatcherService>();
    advancementStage = mock<AdvancementFillStageService>();
    injuryStage = mock<InjuryFillStageService>();
    matcher.match.mockReturnValue({ byPlayer: new Map(), summary: SUMMARY });
    injuryStage.decide.mockReturnValue({ reason: 'lasting-injury-uncertain' });
    profiles.resolve.mockReturnValue(profile());
    validity.isValid.mockReturnValue(true);
    const moduleRef = await Test.createTestingModule({
      providers: [
        IncompletePlayerFillPlannerService,
        { provide: CharacteristicValidityService, useValue: validity },
        { provide: PositionProfileService, useValue: profiles },
        { provide: FeedPlayerMatcherService, useValue: matcher },
        { provide: AdvancementFillStageService, useValue: advancementStage },
        { provide: InjuryFillStageService, useValue: injuryStage },
        // Pure and dependency-free, so passed real to keep asserting real entries.
        FillEntryBuilderService,
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
    expect(plan.report.journeymenFilled).toBe(0);
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
    profiles.resolve.mockReturnValue(
      profile({ line: { ma: 6, st: 3, ag: 3, pa: null, av: 8 } }),
    );

    expect(service.plan(eligibleInput()).entries[0].characteristics).toEqual({
      ma: 6,
      st: 3,
      ag: 3,
      av: 8,
    });
  });

  it('keeps a structural zero passing', () => {
    profiles.resolve.mockReturnValue(
      profile({ line: { ma: 6, st: 3, ag: 3, pa: 0, av: 9 } }),
    );

    expect(service.plan(eligibleInput()).entries[0].characteristics.pa).toBe(0);
  });

  it("checks the position's line against its formats", () => {
    service.plan(eligibleInput());

    expect(validity.isValid).toHaveBeenCalledWith({
      line: profile().line,
      formats: profile().formats,
    });
  });

  it("ignores another player's stat reduction", () => {
    expect(
      service.plan(eligibleInput({ statReductionPlayerIds: [2] })).report
        .eligible,
    ).toBe(1);
  });

  it('fills a player with zero SPP', () => {
    const plan = service.plan(
      eligibleInput({ candidates: [candidate({ sppTotal: 0 })] }),
    );

    expect(plan.entries[0]).toMatchObject({ sppTotal: 0, unspentSpp: 0 });
  });

  it.each<[string, Partial<FillPlannerInput>, SkipReason]>([
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
          { eraId: 4, rulesSetId: 7, rulesSetName: 'BB2020', cheapestCost: 6 },
          {
            eraId: 4,
            rulesSetId: 8,
            rulesSetName: 'BB2020',
            cheapestCost: null,
          },
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
          { eraId: 4, rulesSetId: 7, rulesSetName: 'BB2020', cheapestCost: 6 },
          { eraId: 4, rulesSetId: 8, rulesSetName: 'BB2020', cheapestCost: 5 },
        ],
      },
      'spp-too-high',
    ],
    [
      'an award of a skill-granting trophy',
      { freeSkillRiskPlayerIds: [1] },
      'free-skill-risk',
    ],
    [
      'a recorded stat reduction',
      { statReductionPlayerIds: [1] },
      'lasting-injury-uncertain',
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
      'a stored strength that differs',
      { candidates: [candidate({ strength: 4 })] },
      'stored-data-contradicts',
    ],
    [
      'a stored agility that differs',
      { candidates: [candidate({ agility: 4 })] },
      'stored-data-contradicts',
    ],
    [
      'a stored armour that differs',
      { candidates: [candidate({ armour: 8 })] },
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
      'team-in-ongoing-competition',
    ],
    [
      'a team in an ongoing competition, whatever his stored status',
      {
        candidates: [candidate({ status: 'retired' })],
        ongoingTeamIds: [20],
      },
      'team-in-ongoing-competition',
    ],
    [
      'a team in an ongoing competition, even with a recorded death',
      { deathPlayerIds: [1], ongoingTeamIds: [20] },
      'team-in-ongoing-competition',
    ],
    [
      'a team in an ongoing competition before any SPP check',
      {
        candidates: [candidate({ sppTotal: null })],
        ongoingTeamIds: [20],
      },
      'team-in-ongoing-competition',
    ],
  ])('skips %s', (_label, overrides, reason) => {
    expect(reasonFor(eligibleInput(overrides))).toBe(reason);
  });

  it('skips a stored starting skill whose attribute value differs from the position', () => {
    profiles.resolve.mockReturnValue(
      profile({
        skills: [{ skillId: 102, nameId: 'Loner', attributeValue: '3+' }],
      }),
    );

    expect(
      reasonFor(
        eligibleInput({
          storedAdvancements: [
            {
              playerId: 1,
              source: 'starting',
              skillId: 102,
              skillName: 'Loner',
              attributeValue: '4+',
              isFreeExtra: false,
            },
          ],
        }),
      ),
    ).toBe('stored-data-contradicts');
  });

  it('skips a player whose position is ambiguous', () => {
    profiles.resolve.mockReturnValue(undefined);

    expect(reasonFor(eligibleInput())).toBe('position-ambiguous');
  });

  it("skips a player whose position's characteristics are invalid", () => {
    validity.isValid.mockReturnValue(false);

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
      }),
    );

    expect(plan.entries[0].status).toBe('active');
  });

  it('keeps a stored status over a recorded death', () => {
    const plan = service.plan(
      eligibleInput({
        candidates: [candidate({ status: 'retired' })],
        deathPlayerIds: [1],
      }),
    );

    expect(plan.entries[0].status).toBe('retired');
  });

  it('marks a player dead when his match events record a death', () => {
    const plan = service.plan(
      eligibleInput({
        deathPlayerIds: [1],
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
    expect(Object.keys(plan.report.skipped)).toHaveLength(SKIP_REASONS.length);
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

  it('orders TP ids that are not numbers by code unit', () => {
    const plan = service.plan(
      eligibleInput({
        candidates: [
          candidate({ playerId: 1, tpId: 'b' }),
          candidate({ playerId: 2, tpId: 'B' }),
          candidate({ playerId: 3, tpId: 'a' }),
          candidate({ playerId: 4, tpId: 'a' }),
        ],
      }),
    );

    expect(plan.entries.map((entry) => entry.player.id)).toEqual([
      'B',
      'a',
      'a',
      'b',
    ]);
  });

  it('counts a no-advancement fill and reports no feed without evidence', () => {
    const plan = service.plan(eligibleInput());

    expect(plan.report.eligibleByStage).toEqual({
      noAdvancement: 1,
      advancement: 0,
      injuryOnly: 0,
    });
    expect(plan.report.feed).toBeNull();
    expect(matcher.match).not.toHaveBeenCalled();
    expect(advancementStage.decide).not.toHaveBeenCalled();
  });

  it('matches the feed against the team rows and reports the summary', () => {
    const input = eligibleInput({
      feed: FEED,
      teamRosters: [{ teamId: 20, rosterId: '24801' }],
      teamPlayers: [teamPlayer()],
      paidAdvancements: [
        {
          playerId: 1,
          skillId: 200,
          attributeValue: null,
          characteristic: null,
        },
      ],
    });

    const plan = service.plan(input);

    expect(matcher.match).toHaveBeenCalledWith({
      reports: FEED,
      rosters: input.teamRosters,
      players: input.teamPlayers,
      pricing: {
        paidAdvancements: input.paidAdvancements,
        skillNames: input.skillNames,
        eraRulesSets: input.eraRulesSets,
        advancementCosts: input.advancementCosts,
        skillCategories: input.skillCategories,
        positionAccess: input.positionAccess,
      },
    });
    expect(plan.report.feed).toEqual(SUMMARY);
  });

  it('skips a player the feed names ambiguously', () => {
    matcher.match.mockReturnValue({
      byPlayer: new Map([[1, { kind: 'ambiguous' }]]),
      summary: SUMMARY,
    });

    expect(reasonFor(eligibleInput({ feed: FEED }))).toBe(
      'feed-match-ambiguous',
    );
  });

  it('hands a player the feed names to the advancement stage, with his era and position rows', () => {
    matcher.match.mockReturnValue({
      byPlayer: new Map([[1, { kind: 'reports', reports: [report()] }]]),
      summary: SUMMARY,
    });
    const event = {
      playerId: 1,
      characteristic: 'av' as const,
      competitionId: 50,
      playedAt: '2024-03-01T19:00:00+00:00',
    };
    const played = {
      playerId: 1,
      competitionId: 50,
      firstPlayedAt: '2024-02-01T19:00:00+00:00',
      lastPlayedAt: '2024-04-01T19:00:00+00:00',
    };
    advancementStage.decide.mockReturnValue({ entry: STAGED });
    const ownCost = {
      eraId: 4,
      rulesSetId: 7,
      leagueId: null,
      advancementNumber: 1,
      advancementKind: 'chosen_primary_skill' as const,
      skillId: null,
      sppCost: 6,
    };
    const ownAccess = {
      positionId: 30,
      rulesSetId: 7,
      category: 'agility' as const,
      access: 'primary' as const,
    };

    const plan = service.plan(
      eligibleInput({
        feed: FEED,
        candidates: [candidate({ sppTotal: 40, unspentSpp: 2 })],
        statReductionPlayerIds: [1],
        statReductionEvents: [event, { ...event, playerId: 2 }],
        teamCompetitions: [played, { ...played, playerId: 2 }],
        freeSkillRiskPlayerIds: [1],
        deathTimes: [{ playerId: 1, diedAt: '2024-03-15T19:00:00+00:00' }],
        skillNames: [{ skillId: 200, skillName: 'Dodge', nameId: 'Dodge' }],
        advancementCosts: [ownCost, { ...ownCost, eraId: 9 }],
        skillCategories: [{ skillId: 200, rulesSetId: 7, category: 'agility' }],
        positionAccess: [ownAccess, { ...ownAccess, positionId: 31 }],
      }),
    );

    expect(advancementStage.decide).toHaveBeenCalledWith({
      candidate: candidate({ sppTotal: 40, unspentSpp: 2 }),
      sppTotal: 40,
      status: 'retired',
      reports: [report()],
      hasStatReduction: true,
      reductions: [event],
      competitions: [played],
      rulesSetNames: ['BB2020'],
      diedAt: '2024-03-15T19:00:00+00:00',
      freeSkillRisk: true,
      stored: [],
      profile: profile(),
      skillNames: [{ skillId: 200, skillName: 'Dodge', nameId: 'Dodge' }],
      rulesSetIds: [7],
      costs: [ownCost],
      skillCategories: [{ skillId: 200, rulesSetId: 7, category: 'agility' }],
      positionAccess: [ownAccess],
    });
    expect(plan.entries).toEqual([STAGED]);
    expect(plan.report.eligibleByStage.advancement).toBe(1);
  });

  it("reports the advancement stage's skip reason", () => {
    matcher.match.mockReturnValue({
      byPlayer: new Map([[1, { kind: 'reports', reports: [report()] }]]),
      summary: SUMMARY,
    });
    advancementStage.decide.mockReturnValue({ reason: 'feed-cost-mismatch' });

    expect(reasonFor(eligibleInput({ feed: FEED }))).toBe('feed-cost-mismatch');
  });

  it('applies the shared gates before the feed', () => {
    matcher.match.mockReturnValue({
      byPlayer: new Map([[1, { kind: 'reports', reports: [report()] }]]),
      summary: SUMMARY,
    });

    expect(
      reasonFor(
        eligibleInput({
          feed: FEED,
          candidates: [candidate({ sppTotal: null })],
        }),
      ),
    ).toBe('spp-missing');
    expect(advancementStage.decide).not.toHaveBeenCalled();
  });

  it('does not fill a player with advancing SPP as unadvanced when the feed does not name him', () => {
    // A feed key naming two rosters is only counted ambiguous, so no stored
    // player is marked; his SPP alone must keep him off the no-advancement path.
    expect(
      reasonFor(
        eligibleInput({
          feed: FEED,
          candidates: [candidate({ sppTotal: 40 })],
        }),
      ),
    ).toBe('spp-too-high');
    expect(advancementStage.decide).not.toHaveBeenCalled();
  });

  it('hands a low-SPP player with stat reductions to the injury stage', () => {
    const event = {
      playerId: 1,
      characteristic: 'ma' as const,
      competitionId: 50,
      playedAt: '2024-03-01T19:00:00+00:00',
    };
    const played = {
      playerId: 1,
      competitionId: 50,
      firstPlayedAt: '2024-02-01T19:00:00+00:00',
      lastPlayedAt: '2024-04-01T19:00:00+00:00',
    };
    injuryStage.decide.mockReturnValue({ entry: STAGED });

    const plan = service.plan(
      eligibleInput({
        statReductionPlayerIds: [1],
        statReductionEvents: [event, { ...event, playerId: 2 }],
        teamCompetitions: [played, { ...played, playerId: 2 }],
        deathPlayerIds: [1],
        deathTimes: [
          { playerId: 1, diedAt: '2024-03-15T19:00:00+00:00' },
          { playerId: 2, diedAt: '2024-01-01T19:00:00+00:00' },
        ],
      }),
    );

    expect(injuryStage.decide).toHaveBeenCalledWith({
      candidate: candidate(),
      sppTotal: 5,
      status: 'dead',
      reductions: [event],
      competitions: [played],
      rulesSetNames: ['BB2020'],
      diedAt: '2024-03-15T19:00:00+00:00',
      stored: [],
      profile: profile(),
    });
    expect(plan.entries).toEqual([STAGED]);
    expect(plan.report.eligibleByStage.injuryOnly).toBe(1);
  });

  it('hands the injury stage every rules set name of his era and no death time when none is recorded', () => {
    injuryStage.decide.mockReturnValue({ entry: STAGED });

    service.plan(
      eligibleInput({
        statReductionPlayerIds: [1],
        eraRulesSets: [
          { eraId: 4, rulesSetId: 7, rulesSetName: 'CRP', cheapestCost: 6 },
          { eraId: 4, rulesSetId: 8, rulesSetName: 'CRP+', cheapestCost: 6 },
          { eraId: 9, rulesSetId: 9, rulesSetName: 'BB2020', cheapestCost: 6 },
        ],
      }),
    );

    expect(injuryStage.decide).toHaveBeenCalledWith(
      expect.objectContaining({ rulesSetNames: ['CRP', 'CRP+'], diedAt: null }),
    );
  });

  it.each([
    ['active', null],
    ['retired', null],
    ['dead', '2024-03-15T19:00:00+00:00'],
  ] as const)(
    'with a stored status of %s hands the injury stage the death time %s',
    (status, diedAt) => {
      injuryStage.decide.mockReturnValue({ entry: STAGED });

      service.plan(
        eligibleInput({
          candidates: [candidate({ status })],
          statReductionPlayerIds: [1],
          deathTimes: [{ playerId: 1, diedAt: '2024-03-15T19:00:00+00:00' }],
        }),
      );

      expect(injuryStage.decide).toHaveBeenCalledWith(
        expect.objectContaining({ diedAt }),
      );
    },
  );

  it('skips a free-skill risk before the injury stage', () => {
    expect(
      reasonFor(
        eligibleInput({
          statReductionPlayerIds: [1],
          freeSkillRiskPlayerIds: [1],
        }),
      ),
    ).toBe('free-skill-risk');
    expect(injuryStage.decide).not.toHaveBeenCalled();
  });
});
