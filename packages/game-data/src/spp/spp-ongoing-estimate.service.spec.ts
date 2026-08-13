import type { SppCareerCounts } from '@blood-bowl-tracker/api-contract';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { SppAwardValuesService } from './spp-award-values.service';
import { SppEventCountsService } from './spp-event-counts.service';
import { SppOngoingEstimateService } from './spp-ongoing-estimate.service';

function counts(overrides: Partial<SppCareerCounts> = {}): SppCareerCounts {
  return {
    touchdown: 0,
    completion: 0,
    interception: 0,
    mvp_award: 0,
    casualty: 0,
    ...overrides,
  };
}

describe('SppOngoingEstimateService', () => {
  let service: SppOngoingEstimateService;
  let eventCounts: MockProxy<SppEventCountsService>;
  let awardValues: MockProxy<SppAwardValuesService>;

  beforeEach(async () => {
    eventCounts = mock<SppEventCountsService>();
    awardValues = mock<SppAwardValuesService>();
    eventCounts.emptyCounts.mockReturnValue(counts());
    const moduleRef = await Test.createTestingModule({
      providers: [
        SppOngoingEstimateService,
        { provide: SppEventCountsService, useValue: eventCounts },
        { provide: SppAwardValuesService, useValue: awardValues },
      ],
    }).compile();
    service = moduleRef.get(SppOngoingEstimateService);
  });

  it('prices the shortfall between the career count and the imported count', async () => {
    // 12 career touchdowns, 9 imported → 3 belong to an ongoing competition,
    // worth 3 SPP each under the standardised table.
    eventCounts.importedCountsForPlayers.mockResolvedValue(
      new Map([[1, counts({ touchdown: 9 })]]),
    );
    awardValues.resolveSppValue.mockResolvedValue(3);

    const estimates = await service.estimateForPlayers([
      { playerId: 1, careerCounts: counts({ touchdown: 12 }) },
    ]);

    expect(estimates.get(1)).toBe(9);
    expect(awardValues.resolveSppValue).toHaveBeenCalledWith({
      actingPlayerId: 1,
      actionType: 'touchdown',
    });
  });

  it('sums the shortfall across every group', async () => {
    eventCounts.importedCountsForPlayers.mockResolvedValue(
      new Map([[1, counts()]]),
    );
    awardValues.resolveSppValue
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(1);

    const estimates = await service.estimateForPlayers([
      {
        playerId: 1,
        careerCounts: counts({ touchdown: 1, casualty: 2, mvp_award: 1 }),
      },
    ]);

    expect(estimates.get(1)).toBe(1 + 2 + 4);
  });

  it('never looks up an award value for a group with no shortfall', async () => {
    eventCounts.importedCountsForPlayers.mockResolvedValue(
      new Map([[1, counts({ touchdown: 9 })]]),
    );

    await service.estimateForPlayers([
      { playerId: 1, careerCounts: counts({ touchdown: 9 }) },
    ]);

    expect(awardValues.resolveSppValue).not.toHaveBeenCalled();
  });

  it('clamps a negative shortfall to zero', async () => {
    // More imported than TP's career figure claims — an inconsistency, not a
    // reason to subtract SPP from the estimate.
    eventCounts.importedCountsForPlayers.mockResolvedValue(
      new Map([[1, counts({ touchdown: 12 })]]),
    );

    const estimates = await service.estimateForPlayers([
      { playerId: 1, careerCounts: counts({ touchdown: 9 }) },
    ]);

    expect(estimates.get(1)).toBe(0);
    expect(awardValues.resolveSppValue).not.toHaveBeenCalled();
  });

  it('treats an unpriceable group as worth zero', async () => {
    eventCounts.importedCountsForPlayers.mockResolvedValue(
      new Map([[1, counts()]]),
    );
    awardValues.resolveSppValue.mockResolvedValue(undefined);

    const estimates = await service.estimateForPlayers([
      { playerId: 1, careerCounts: counts({ touchdown: 4 }) },
    ]);

    expect(estimates.get(1)).toBe(0);
  });

  it('treats a player missing from the imported map as having imported nothing', async () => {
    eventCounts.importedCountsForPlayers.mockResolvedValue(new Map());
    awardValues.resolveSppValue.mockResolvedValue(3);

    const estimates = await service.estimateForPlayers([
      { playerId: 1, careerCounts: counts({ touchdown: 2 }) },
    ]);

    expect(estimates.get(1)).toBe(6);
  });

  it('skips a player with no career counts entirely', async () => {
    eventCounts.importedCountsForPlayers.mockResolvedValue(
      new Map([[2, counts()]]),
    );
    awardValues.resolveSppValue.mockResolvedValue(3);

    const estimates = await service.estimateForPlayers([
      { playerId: 1 },
      { playerId: 2, careerCounts: counts({ touchdown: 1 }) },
    ]);

    expect(estimates.has(1)).toBe(false);
    expect(estimates.get(2)).toBe(3);
    expect(eventCounts.importedCountsForPlayers).toHaveBeenCalledWith([2]);
  });

  it('issues no count query when nobody has career counts', async () => {
    const estimates = await service.estimateForPlayers([{ playerId: 1 }]);

    expect(estimates).toEqual(new Map());
    expect(eventCounts.importedCountsForPlayers).not.toHaveBeenCalled();
  });
});
