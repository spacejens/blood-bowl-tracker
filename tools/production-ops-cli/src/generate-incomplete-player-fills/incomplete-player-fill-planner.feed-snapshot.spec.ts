import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import type { TpRosterSnapshots } from '../read-tp-roster-snapshots/tp-roster-snapshots.schema';
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
  FillEntry,
  FillPlannerInput,
  SkipReason,
} from './fill-plan.types';
import { IncompletePlayerFillPlannerService } from './incomplete-player-fill-planner.service';
import { InjuryFillStageService } from './injury-fill-stage.service';
import { PositionProfileService } from './position-profile.service';
import { SnapshotFillStageService } from './snapshot-fill-stage.service';

const SUMMARY: FeedSummary = {
  reportKeys: 1,
  matchedKeys: 1,
  ambiguousKeys: 0,
  unmatchedKeys: 0,
};
const FEED = { Firestarters: { '#13 Flame (Gnoblar Lineman)': [report()] } };
const SNAPSHOTS: TpRosterSnapshots = {
  players: {
    '500': [
      {
        lineUpMasterId: 288,
        level: 2,
        skillMasterIds: [92, 93],
        totalSpp: 16,
        unspentSpp: 2,
        sources: ['e/match_1.json'],
      },
    ],
  },
  conflicts: [],
  unreadable: [],
};
const STAGED: FillEntry = {
  player: { system: 'tourplay.net', id: '500' },
  status: 'retired',
  characteristics: { ma: 6, st: 3, ag: 3, pa: 4, av: 9 },
  sppTotal: 16,
  unspentSpp: 2,
  startingSkills: [],
  advancements: [
    { skill: { system: 'Name', id: 'Guard' }, source: 'chosen' },
    { skill: { system: 'Name', id: 'Dodge' }, source: 'chosen' },
  ],
};

describe('IncompletePlayerFillPlannerService feed reports completed by snapshots', () => {
  let service: IncompletePlayerFillPlannerService;
  let matcher: MockProxy<FeedPlayerMatcherService>;
  let advancementStage: MockProxy<AdvancementFillStageService>;
  let snapshotStage: MockProxy<SnapshotFillStageService>;

  beforeEach(async () => {
    const validity = mock<CharacteristicValidityService>();
    const profiles = mock<PositionProfileService>();
    matcher = mock<FeedPlayerMatcherService>();
    advancementStage = mock<AdvancementFillStageService>();
    snapshotStage = mock<SnapshotFillStageService>();
    matcher.match.mockReturnValue({
      byPlayer: new Map([[1, { kind: 'reports', reports: [report()] }]]),
      summary: SUMMARY,
    });
    profiles.resolve.mockReturnValue(profile());
    validity.isValid.mockReturnValue(true);
    advancementStage.decide.mockReturnValue({ reason: 'spp-does-not-add-up' });
    const moduleRef = await Test.createTestingModule({
      providers: [
        IncompletePlayerFillPlannerService,
        { provide: CharacteristicValidityService, useValue: validity },
        { provide: PositionProfileService, useValue: profiles },
        { provide: FeedPlayerMatcherService, useValue: matcher },
        { provide: AdvancementFillStageService, useValue: advancementStage },
        {
          provide: InjuryFillStageService,
          useValue: mock<InjuryFillStageService>(),
        },
        { provide: SnapshotFillStageService, useValue: snapshotStage },
        // Pure and dependency-free, so passed real to keep asserting real entries.
        FillEntryBuilderService,
      ],
    }).compile();
    service = moduleRef.get(IncompletePlayerFillPlannerService);
  });

  /** A feed-named player of 16 SPP whom a snapshot shows, with both evidences loaded. */
  const input = (overrides: Partial<FillPlannerInput> = {}) =>
    eligibleInput({
      candidates: [candidate({ sppTotal: 16, unspentSpp: 2 })],
      feed: FEED,
      snapshots: SNAPSHOTS,
      tpPositionIds: [{ positionId: 30, tpPositionId: '288' }],
      ...overrides,
    });

  function reasonFor(plannerInput: FillPlannerInput): SkipReason | undefined {
    const skipped = Object.entries(
      service.plan(plannerInput).report.skipped,
    ).find(([, tally]) => tally.count > 0);
    return skipped?.[0] as SkipReason | undefined;
  }

  it('fills from the snapshot, with his feed reports fixed, when they do not add up', () => {
    snapshotStage.decide.mockReturnValue({ entry: STAGED });
    const plan = service.plan(input());

    expect(plan.entries).toEqual([STAGED]);
    expect(plan.report.eligibleByStage).toEqual({
      noAdvancement: 0,
      advancement: 0,
      injuryOnly: 0,
      snapshot: 0,
      feedWithSnapshot: 1,
    });
    expect(snapshotStage.decide).toHaveBeenCalledWith(
      expect.objectContaining({
        feedReports: [report()],
        snapshot: SNAPSHOTS.players['500'],
        positionTpIds: ['288'],
        sppTotal: 16,
      }),
    );
  });

  it.each<SkipReason>(['snapshot-spend-mismatch', 'snapshot-missing'])(
    'keeps spp-does-not-add-up when the snapshot stage reports %s',
    (reason) => {
      snapshotStage.decide.mockReturnValue({ reason });

      expect(reasonFor(input())).toBe('spp-does-not-add-up');
    },
  );

  it('hands over no snapshot for a feed player no file shows', () => {
    snapshotStage.decide.mockReturnValue({ reason: 'snapshot-missing' });
    service.plan(input({ snapshots: { ...SNAPSHOTS, players: {} } }));

    expect(snapshotStage.decide).toHaveBeenCalledWith(
      expect.objectContaining({ snapshot: undefined }),
    );
  });

  it('does not consult the snapshot without snapshot evidence', () => {
    expect(reasonFor(input({ snapshots: null }))).toBe('spp-does-not-add-up');
    expect(snapshotStage.decide).not.toHaveBeenCalled();
  });

  it.each<SkipReason>([
    'feed-cost-mismatch',
    'skill-unresolved',
    'lasting-injury-uncertain',
  ])(
    'keeps the feed stage reason %s without consulting the snapshot',
    (reason) => {
      advancementStage.decide.mockReturnValue({ reason });

      expect(reasonFor(input())).toBe(reason);
      expect(snapshotStage.decide).not.toHaveBeenCalled();
    },
  );

  it('counts a feed fill under advancement without consulting the snapshot', () => {
    advancementStage.decide.mockReturnValue({ entry: STAGED });
    const plan = service.plan(input());

    expect(plan.report.eligibleByStage.advancement).toBe(1);
    expect(plan.report.eligibleByStage.feedWithSnapshot).toBe(0);
    expect(snapshotStage.decide).not.toHaveBeenCalled();
  });
});
