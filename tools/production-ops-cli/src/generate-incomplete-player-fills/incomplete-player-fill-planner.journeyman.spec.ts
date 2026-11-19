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
} from './fill-plan.test-helpers';
import type {
  FeedSummary,
  FillPlannerInput,
  SkipReason,
  StoredAdvancementRow,
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
const LONER = { skillId: 102, skillName: 'Loner', nameId: 'Loner' };

function storedRow(
  overrides: Partial<StoredAdvancementRow> = {},
): StoredAdvancementRow {
  return {
    playerId: 1,
    source: 'starting',
    skillId: 102,
    skillName: 'Loner',
    attributeValue: null,
    isFreeExtra: false,
    ...overrides,
  };
}

/** A marked journeyman with a stored starting Loner, otherwise eligible. */
function journeymanInput(
  overrides: Partial<FillPlannerInput> = {},
): FillPlannerInput {
  return eligibleInput({
    candidates: [candidate({ isJourneyman: true })],
    skillNames: [LONER],
    storedAdvancements: [storedRow()],
    ...overrides,
  });
}

describe('IncompletePlayerFillPlannerService journeymen', () => {
  let service: IncompletePlayerFillPlannerService;
  let profiles: MockProxy<PositionProfileService>;
  let matcher: MockProxy<FeedPlayerMatcherService>;
  let advancementStage: MockProxy<AdvancementFillStageService>;
  let injuryStage: MockProxy<InjuryFillStageService>;

  beforeEach(async () => {
    const validity = mock<CharacteristicValidityService>();
    profiles = mock<PositionProfileService>();
    matcher = mock<FeedPlayerMatcherService>();
    advancementStage = mock<AdvancementFillStageService>();
    injuryStage = mock<InjuryFillStageService>();
    matcher.match.mockReturnValue({ byPlayer: new Map(), summary: SUMMARY });
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

  it('fills a marked journeyman as unadvanced, leaving his Loner to the server', () => {
    profiles.resolve.mockReturnValue(
      profile({
        skills: [
          { skillId: 100, nameId: 'Block', attributeValue: null },
          { skillId: 102, nameId: 'Loner', attributeValue: '4+' },
        ],
      }),
    );

    const plan = service.plan(journeymanInput());

    expect(plan.entries).toEqual([
      {
        player: { system: 'tourplay.net', id: '500' },
        journeyman: true,
        status: 'retired',
        characteristics: { ma: 6, st: 3, ag: 3, pa: 4, av: 9 },
        sppTotal: 5,
        unspentSpp: 5,
        startingSkills: [{ system: 'Name', id: 'Block' }],
        advancements: [],
      },
    ]);
    expect(plan.report.journeymenFilled).toBe(1);
    expect(plan.report.eligibleByStage.noAdvancement).toBe(1);
  });

  it('fills one with no Loner stored yet', () => {
    expect(
      service.plan(journeymanInput({ storedAdvancements: [] })).entries,
    ).toHaveLength(1);
  });

  it('still refuses a stored starting skill his position does not list', () => {
    expect(
      reasonFor(
        journeymanInput({
          storedAdvancements: [
            storedRow(),
            storedRow({ skillId: 300, skillName: 'Sure Hands' }),
          ],
        }),
      ),
    ).toBe('stored-data-contradicts');
  });

  it('applies the shared gates first', () => {
    expect(reasonFor(journeymanInput({ ongoingTeamIds: [20] }))).toBe(
      'team-in-ongoing-competition',
    );
  });

  it('skips one in a Big Guy position of his era as a journeyman', () => {
    expect(
      reasonFor(
        journeymanInput({ bigGuyPositions: [{ positionId: 30, eraId: 4 }] }),
      ),
    ).toBe('journeyman');
  });

  it('ignores a Big Guy keyword of another era', () => {
    expect(
      reasonFor(
        journeymanInput({ bigGuyPositions: [{ positionId: 30, eraId: 5 }] }),
      ),
    ).toBeUndefined();
  });

  it.each([
    ['reports', { kind: 'reports' as const, reports: [report()] }],
    ['an ambiguous key', { kind: 'ambiguous' as const }],
  ])(
    'skips one the feed names with %s, without staging him',
    (_label, match) => {
      matcher.match.mockReturnValue({
        byPlayer: new Map([[1, match]]),
        summary: SUMMARY,
      });

      expect(reasonFor(journeymanInput({ feed: FEED }))).toBe(
        'feed-match-ambiguous',
      );
      expect(advancementStage.decide).not.toHaveBeenCalled();
    },
  );

  it('skips one whose total reaches the cheapest advancement', () => {
    expect(
      reasonFor(
        journeymanInput({
          candidates: [candidate({ isJourneyman: true, sppTotal: 6 })],
        }),
      ),
    ).toBe('spp-too-high');
  });

  it('skips one holding an award of a skill-granting trophy', () => {
    expect(reasonFor(journeymanInput({ freeSkillRiskPlayerIds: [1] }))).toBe(
      'free-skill-risk',
    );
  });

  it('skips one with a gained Loner stored', () => {
    expect(
      reasonFor(
        journeymanInput({
          storedAdvancements: [storedRow({ source: 'advancement' })],
        }),
      ),
    ).toBe('free-skill-risk');
  });

  it('skips one with stat reductions as a journeyman, without the injury stage', () => {
    expect(reasonFor(journeymanInput({ statReductionPlayerIds: [1] }))).toBe(
      'journeyman',
    );
    expect(injuryStage.decide).not.toHaveBeenCalled();
  });
});
