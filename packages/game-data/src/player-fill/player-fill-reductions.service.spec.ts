import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { PositionCharacteristicsContext } from '../position-rules-sets/position-rules-sets.service';
import { PositionRulesSetsService } from '../position-rules-sets/position-rules-sets.service';
import type { LastingReductionCounts } from './player-fill.types';
import type { ReductionsInput } from './player-fill-reductions.service';
import { PlayerFillReductionsService } from './player-fill-reductions.service';

const NO_REDUCTIONS: LastingReductionCounts = {
  moveReductionCount: 0,
  strengthReductionCount: 0,
  agilityReductionCount: 0,
  passingReductionCount: 0,
  armourReductionCount: 0,
};

const BASELINE = { move: 6, strength: 3, agility: 3, passing: 4, armour: 9 };

const CONTEXT: PositionCharacteristicsContext = {
  rulesSetId: 2,
  moveFormat: 'bare',
  strengthFormat: 'bare',
  agilityFormat: 'plus',
  passingFormat: 'plus',
  armourFormat: 'plus',
  baseline: BASELINE,
};

function input(overrides: Partial<ReductionsInput> = {}): ReductionsInput {
  return {
    positionId: 30,
    eraId: 4,
    line: BASELINE,
    increases: [],
    ...overrides,
  };
}

describe('PlayerFillReductionsService', () => {
  let service: PlayerFillReductionsService;
  let positionRulesSets: MockProxy<PositionRulesSetsService>;

  beforeEach(async () => {
    positionRulesSets = mock<PositionRulesSetsService>();
    positionRulesSets.findCharacteristicsContext.mockResolvedValue(CONTEXT);
    const moduleRef = await Test.createTestingModule({
      providers: [
        PlayerFillReductionsService,
        { provide: PositionRulesSetsService, useValue: positionRulesSets },
      ],
    }).compile();
    service = moduleRef.get(PlayerFillReductionsService);
  });

  it("reads the context of the player's position in his era", async () => {
    await service.derive(input());

    expect(positionRulesSets.findCharacteristicsContext).toHaveBeenCalledWith(
      30,
      4,
    );
  });

  it('counts nothing for the start values', async () => {
    await expect(service.derive(input())).resolves.toEqual(NO_REDUCTIONS);
  });

  it('counts a reduction alone', async () => {
    await expect(
      service.derive(input({ line: { ...BASELINE, armour: 8 } })),
    ).resolves.toEqual({ ...NO_REDUCTIONS, armourReductionCount: 1 });
  });

  it('counts two reductions', async () => {
    await expect(
      service.derive(input({ line: { ...BASELINE, move: 4 } })),
    ).resolves.toEqual({ ...NO_REDUCTIONS, moveReductionCount: 2 });
  });

  it('counts an increase undone by a reduction on the same characteristic', async () => {
    await expect(service.derive(input({ increases: ['AV'] }))).resolves.toEqual(
      { ...NO_REDUCTIONS, armourReductionCount: 1 },
    );
  });

  it('counts two reductions under one increase', async () => {
    await expect(
      service.derive(
        input({ line: { ...BASELINE, strength: 2 }, increases: ['ST'] }),
      ),
    ).resolves.toEqual({ ...NO_REDUCTIONS, strengthReductionCount: 2 });
  });

  it('counts nothing for an increase that shows', async () => {
    await expect(
      service.derive(
        input({ line: { ...BASELINE, move: 7 }, increases: ['MA'] }),
      ),
    ).resolves.toEqual(NO_REDUCTIONS);
  });

  it('never counts below zero', async () => {
    await expect(
      service.derive(input({ line: { ...BASELINE, armour: 10 } })),
    ).resolves.toEqual(NO_REDUCTIONS);
  });

  it('reads a higher AG as worse in a target-number format', async () => {
    await expect(
      service.derive(input({ line: { ...BASELINE, agility: 4 } })),
    ).resolves.toEqual({ ...NO_REDUCTIONS, agilityReductionCount: 1 });
    await expect(
      service.derive(
        input({ line: { ...BASELINE, agility: 2 }, increases: ['AG'] }),
      ),
    ).resolves.toEqual(NO_REDUCTIONS);
  });

  it('reads a lower AG as worse when bare', async () => {
    positionRulesSets.findCharacteristicsContext.mockResolvedValue({
      ...CONTEXT,
      agilityFormat: 'bare',
    });

    await expect(
      service.derive(input({ line: { ...BASELINE, agility: 2 } })),
    ).resolves.toEqual({ ...NO_REDUCTIONS, agilityReductionCount: 1 });
  });

  it('reads PA as a target under plus_zero_legal', async () => {
    positionRulesSets.findCharacteristicsContext.mockResolvedValue({
      ...CONTEXT,
      passingFormat: 'plus_zero_legal',
    });

    await expect(
      service.derive(input({ line: { ...BASELINE, passing: 5 } })),
    ).resolves.toEqual({ ...NO_REDUCTIONS, passingReductionCount: 1 });
  });

  it('counts no PA reduction under a rules set without Passing', async () => {
    positionRulesSets.findCharacteristicsContext.mockResolvedValue({
      ...CONTEXT,
      passingFormat: 'absent',
      baseline: { ...BASELINE, passing: null },
    });

    await expect(
      service.derive(
        input({ line: { ...BASELINE, passing: null }, increases: ['PA'] }),
      ),
    ).resolves.toEqual(NO_REDUCTIONS);
  });

  it('counts no PA reduction when the line or the baseline has no PA', async () => {
    await expect(
      service.derive(
        input({ line: { ...BASELINE, passing: null }, increases: ['PA'] }),
      ),
    ).resolves.toEqual(NO_REDUCTIONS);
    positionRulesSets.findCharacteristicsContext.mockResolvedValue({
      ...CONTEXT,
      baseline: { ...BASELINE, passing: null },
    });
    await expect(service.derive(input({ increases: ['PA'] }))).resolves.toEqual(
      NO_REDUCTIONS,
    );
  });

  it('counts nothing when the position has no baseline', async () => {
    positionRulesSets.findCharacteristicsContext.mockResolvedValue({
      ...CONTEXT,
      baseline: undefined,
    });

    await expect(
      service.derive(input({ line: { ...BASELINE, armour: 7 } })),
    ).resolves.toEqual(NO_REDUCTIONS);
  });

  it('counts nothing when no rules set resolves for the era', async () => {
    positionRulesSets.findCharacteristicsContext.mockResolvedValue(undefined);

    await expect(
      service.derive(input({ line: { ...BASELINE, armour: 7 } })),
    ).resolves.toEqual(NO_REDUCTIONS);
  });
});
