import { DB } from '@blood-bowl-tracker/db';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { MaxCountTrophyRuleService } from './max-count-trophy-rule.service';
import { MaxSppSumTrophyRuleService } from './max-spp-sum-trophy-rule.service';
import { MissingTrophyAwardsService } from './missing-trophy-awards.service';
import { CareerThresholdTrophyRuleService } from './threshold-trophy-rule.service';
import { TrophyAwardsService } from './trophy-awards.service';

interface Mocks {
  maxCount: MockProxy<MaxCountTrophyRuleService>;
  maxSppSum: MockProxy<MaxSppSumTrophyRuleService>;
  careerThreshold: MockProxy<CareerThresholdTrophyRuleService>;
  trophyAwards: MockProxy<TrophyAwardsService>;
}

/**
 * Per-test factory: each test seeds different rows into the mocked database,
 * and those rows must exist before the service is built. Seed order matches
 * the service's fixed query order (competition scope, applicable trophies,
 * already-awarded trophy ids, included types, excluded types, curated
 * eligible positions, and — only when that last one returned rows — the
 * position external ids they resolve to).
 */
async function makeService(rowsPerQuery: unknown[][]): Promise<{
  service: MissingTrophyAwardsService;
  mocks: Mocks;
}> {
  const db = mockDb(...rowsPerQuery);
  const mocks: Mocks = {
    maxCount: mock<MaxCountTrophyRuleService>(),
    maxSppSum: mock<MaxSppSumTrophyRuleService>(),
    careerThreshold: mock<CareerThresholdTrophyRuleService>(),
    trophyAwards: mock<TrophyAwardsService>(),
  };
  mocks.maxCount.compute.mockResolvedValue([]);
  mocks.maxSppSum.compute.mockResolvedValue([]);
  mocks.careerThreshold.compute.mockResolvedValue([]);
  mocks.trophyAwards.upsert.mockResolvedValue({
    trophyAward: { id: 1 },
    created: true,
  } as never);
  const moduleRef = await Test.createTestingModule({
    providers: [
      MissingTrophyAwardsService,
      { provide: MaxCountTrophyRuleService, useValue: mocks.maxCount },
      { provide: MaxSppSumTrophyRuleService, useValue: mocks.maxSppSum },
      {
        provide: CareerThresholdTrophyRuleService,
        useValue: mocks.careerThreshold,
      },
      { provide: TrophyAwardsService, useValue: mocks.trophyAwards },
      { provide: DB, useValue: db.db },
    ],
  }).compile();
  return { service: moduleRef.get(MissingTrophyAwardsService), mocks };
}

const COMPETITION_SCOPE = [{ competitionGroupId: 4, leagueId: 1 }];

function trophyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    awardRuleKind: 'max_count',
    awardRuleRole: 'acting',
    awardRuleTieCutoff: 4,
    awardRuleThreshold: null,
    awardRuleMeasure: null,
    ...overrides,
  };
}

describe('MissingTrophyAwardsService', () => {
  it('dispatches a max_count trophy to the count rule and records its winners', async () => {
    const { service, mocks } = await makeService([
      COMPETITION_SCOPE,
      [trophyRow()],
      [],
      [{ trophyId: 10, actionType: 'touchdown', consequenceType: null }],
      [],
    ]);
    mocks.maxCount.compute.mockResolvedValue([{ playerId: 5, teamEraId: 50 }]);

    const result = await service.computeMissingAwards(3);

    expect(mocks.maxCount.compute).toHaveBeenCalledWith({
      competitionId: 3,
      role: 'acting',
      types: { actionTypes: ['touchdown'], consequenceTypes: [] },
      eligiblePositionIds: undefined,
      tieCutoff: 4,
    });
    expect(mocks.trophyAwards.upsert).toHaveBeenCalledWith({
      trophyId: 10,
      competitionId: 3,
      teamEraId: 50,
      playerId: 5,
    });
    expect(result).toEqual({
      competitionId: 3,
      createdAwardCount: 1,
      awardedTrophyIds: [10],
    });
  });

  it('dispatches a max_spp_sum trophy with its exclusion list', async () => {
    const { service, mocks } = await makeService([
      COMPETITION_SCOPE,
      [trophyRow({ id: 11, awardRuleKind: 'max_spp_sum' })],
      [],
      [],
      [{ trophyId: 11, actionType: 'mvp_award', consequenceType: null }],
    ]);

    await service.computeMissingAwards(3);

    expect(mocks.maxSppSum.compute).toHaveBeenCalledWith({
      competitionId: 3,
      role: 'acting',
      types: { actionTypes: [], consequenceTypes: [] },
      excludedTypes: { actionTypes: ['mvp_award'], consequenceTypes: [] },
      eligiblePositionIds: undefined,
      tieCutoff: 4,
    });
  });

  it('dispatches a career_threshold trophy against the league', async () => {
    const { service, mocks } = await makeService([
      COMPETITION_SCOPE,
      [
        trophyRow({
          id: 12,
          awardRuleKind: 'career_threshold',
          awardRuleRole: 'consequence',
          awardRuleTieCutoff: null,
          awardRuleThreshold: 3,
          awardRuleMeasure: 'event_count',
        }),
      ],
      [],
      [{ trophyId: 12, actionType: null, consequenceType: 'casualty' }],
      [],
    ]);

    await service.computeMissingAwards(3);

    // Both scopes: the running total is league-wide, but the award only lands
    // in the competition the player actually crossed the threshold in.
    expect(mocks.careerThreshold.compute).toHaveBeenCalledWith({
      trophyId: 12,
      competitionId: 3,
      leagueId: 1,
      role: 'consequence',
      types: { actionTypes: [], consequenceTypes: ['casualty'] },
      eligiblePositionIds: undefined,
      threshold: 3,
      measure: 'event_count',
    });
  });

  it('never computes a direct_source or manual trophy', async () => {
    const { service, mocks } = await makeService([
      COMPETITION_SCOPE,
      [
        trophyRow({ id: 13, awardRuleKind: 'direct_source' }),
        trophyRow({ id: 14, awardRuleKind: 'manual' }),
      ],
      [],
      [],
      [],
    ]);

    const result = await service.computeMissingAwards(3);

    expect(mocks.maxCount.compute).not.toHaveBeenCalled();
    expect(mocks.maxSppSum.compute).not.toHaveBeenCalled();
    expect(mocks.careerThreshold.compute).not.toHaveBeenCalled();
    expect(result.createdAwardCount).toBe(0);
  });

  it('skips a trophy the source importer already awarded in this competition', async () => {
    const { service, mocks } = await makeService([
      COMPETITION_SCOPE,
      [trophyRow()],
      [{ trophyId: 10 }],
      [],
      [],
    ]);

    await service.computeMissingAwards(3);

    expect(mocks.maxCount.compute).not.toHaveBeenCalled();
  });

  it('still computes a career_threshold trophy already awarded in this competition', async () => {
    const { service, mocks } = await makeService([
      COMPETITION_SCOPE,
      [
        trophyRow({
          id: 12,
          awardRuleKind: 'career_threshold',
          awardRuleTieCutoff: null,
          awardRuleThreshold: 176,
          awardRuleMeasure: 'spp_sum',
        }),
      ],
      [{ trophyId: 12 }],
      [],
      [],
    ]);

    await service.computeMissingAwards(3);

    // A lifetime trophy can legitimately be won by a second player in the same
    // competition, so the per-competition gap check does not apply to it —
    // the per-player check inside the rule service does.
    expect(mocks.careerThreshold.compute).toHaveBeenCalled();
  });

  it('counts only awards it actually created, not ones already present', async () => {
    const { service, mocks } = await makeService([
      COMPETITION_SCOPE,
      [trophyRow()],
      [],
      [],
      [],
    ]);
    mocks.maxCount.compute.mockResolvedValue([
      { playerId: 5, teamEraId: 50 },
      { playerId: 6, teamEraId: 60 },
    ]);
    mocks.trophyAwards.upsert
      .mockResolvedValueOnce({ trophyAward: { id: 1 }, created: true } as never)
      .mockResolvedValueOnce({
        trophyAward: { id: 2 },
        created: false,
      } as never);

    const result = await service.computeMissingAwards(3);

    expect(result.createdAwardCount).toBe(1);
  });

  it('resolves a rule\u2019s curated eligible positions to position ids', async () => {
    const { service, mocks } = await makeService([
      COMPETITION_SCOPE,
      [trophyRow({ id: 11, awardRuleKind: 'max_spp_sum' })],
      [],
      [],
      [],
      [
        { trophyId: 11, positionNameExternalId: 'Ogre: Ogre Blocker' },
        { trophyId: 11, positionNameExternalId: 'Ogre: Ogre Runt Punter' },
      ],
      [
        { positionId: 21, externalId: 'Ogre: Ogre Blocker' },
        { positionId: 22, externalId: 'Ogre: Ogre Runt Punter' },
      ],
    ]);

    await service.computeMissingAwards(3);

    expect(mocks.maxSppSum.compute).toHaveBeenCalledWith(
      expect.objectContaining({ eligiblePositionIds: [21, 22] }),
    );
  });

  it('restricts a rule to nothing when no curated position resolves', async () => {
    const { service, mocks } = await makeService([
      COMPETITION_SCOPE,
      [trophyRow({ id: 11, awardRuleKind: 'max_spp_sum' })],
      [],
      [],
      [],
      [{ trophyId: 11, positionNameExternalId: 'Ogre: Typo' }],
      [],
    ]);

    await service.computeMissingAwards(3);

    // Deliberately NOT `undefined`: a restriction whose positions are all
    // unknown must award nobody rather than fall back to every player.
    expect(mocks.maxSppSum.compute).toHaveBeenCalledWith(
      expect.objectContaining({ eligiblePositionIds: [] }),
    );
  });

  it('does nothing for a competition that does not exist', async () => {
    const { service, mocks } = await makeService([[]]);

    const result = await service.computeMissingAwards(999);

    expect(mocks.maxCount.compute).not.toHaveBeenCalled();
    expect(result).toEqual({
      competitionId: 999,
      createdAwardCount: 0,
      awardedTrophyIds: [],
    });
  });
});
