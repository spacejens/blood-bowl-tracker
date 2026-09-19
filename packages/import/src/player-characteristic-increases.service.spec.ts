import type {
  PositionRulesSetCharacteristics,
  RulesSet,
} from '@blood-bowl-tracker/api-contract';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { ImportResultService } from './import-result.service';
import { PlayerCharacteristicIncreasesService } from './player-characteristic-increases.service';
import { PositionRulesSetsImportService } from './position-rules-sets-import.service';
import type { ImportError } from './types';

const BARE_RULES_SET: RulesSet = {
  id: 7,
  name: 'BB2020',
  moveFormat: 'bare',
  strengthFormat: 'bare',
  agilityFormat: 'plus',
  passingFormat: 'plus',
  armourFormat: 'plus',
  createdAt: new Date('2026-01-01'),
};

const NO_REDUCTIONS = {
  moveReductionCount: 0,
  strengthReductionCount: 0,
  agilityReductionCount: 0,
  passingReductionCount: 0,
  armourReductionCount: 0,
};

function baseline(
  overrides: Partial<PositionRulesSetCharacteristics> = {},
): PositionRulesSetCharacteristics {
  return {
    rulesSetId: 7,
    move: 6,
    strength: 3,
    agility: 3,
    passing: 4,
    armour: 9,
    ...overrides,
  };
}

describe('PlayerCharacteristicIncreasesService', () => {
  let service: PlayerCharacteristicIncreasesService;
  let positionRulesSets: MockProxy<PositionRulesSetsImportService>;
  let errors: ImportError[];

  beforeEach(async () => {
    positionRulesSets = mock<PositionRulesSetsImportService>();
    errors = [];
    const moduleRef = await Test.createTestingModule({
      providers: [
        PlayerCharacteristicIncreasesService,
        {
          provide: PositionRulesSetsImportService,
          useValue: positionRulesSets,
        },
        ImportResultService,
      ],
    }).compile();
    service = moduleRef.get(PlayerCharacteristicIncreasesService);
  });

  it('reports no increases for a player who matches the baseline', async () => {
    positionRulesSets.listPositionRulesSets.mockResolvedValue([baseline()]);

    const counts = await service.forPlayer({
      player: { label: 'Grim (12)', positionId: 3 },
      rulesSet: BARE_RULES_SET,
      current: { move: 6, strength: 3, agility: 3, passing: 4, armour: 9 },
      reductions: NO_REDUCTIONS,
      errors,
    });

    expect(counts).toEqual({
      moveIncreaseCount: 0,
      strengthIncreaseCount: 0,
      agilityIncreaseCount: 0,
      passingIncreaseCount: 0,
      armourIncreaseCount: 0,
    });
    expect(errors).toEqual([]);
  });

  it('counts a bare-format characteristic that is higher than the baseline', async () => {
    positionRulesSets.listPositionRulesSets.mockResolvedValue([baseline()]);

    const counts = await service.forPlayer({
      player: { label: 'Grim (12)', positionId: 3 },
      rulesSet: BARE_RULES_SET,
      current: { move: 8, strength: 4, agility: 3, passing: 4, armour: 9 },
      reductions: NO_REDUCTIONS,
      errors,
    });

    expect(counts?.moveIncreaseCount).toBe(2);
    expect(counts?.strengthIncreaseCount).toBe(1);
  });

  it('counts a roll-target characteristic that is LOWER than the baseline', async () => {
    positionRulesSets.listPositionRulesSets.mockResolvedValue([baseline()]);

    const counts = await service.forPlayer({
      player: { label: 'Grim (12)', positionId: 3 },
      rulesSet: BARE_RULES_SET,
      current: { move: 6, strength: 3, agility: 2, passing: 3, armour: 9 },
      reductions: NO_REDUCTIONS,
      errors,
    });

    expect(counts?.agilityIncreaseCount).toBe(1);
    expect(counts?.passingIncreaseCount).toBe(1);
  });

  it('counts armour upward even under a roll-target format', async () => {
    positionRulesSets.listPositionRulesSets.mockResolvedValue([baseline()]);

    const counts = await service.forPlayer({
      player: { label: 'Grim (12)', positionId: 3 },
      rulesSet: BARE_RULES_SET,
      current: { move: 6, strength: 3, agility: 3, passing: 4, armour: 10 },
      reductions: NO_REDUCTIONS,
      errors,
    });

    expect(counts?.armourIncreaseCount).toBe(1);
  });

  it('adds back an outstanding reduction that is masking an increase', async () => {
    positionRulesSets.listPositionRulesSets.mockResolvedValue([baseline()]);

    const counts = await service.forPlayer({
      player: { label: 'Grim (12)', positionId: 3 },
      rulesSet: BARE_RULES_SET,
      current: { move: 6, strength: 3, agility: 3, passing: 4, armour: 9 },
      reductions: { ...NO_REDUCTIONS, moveReductionCount: 2 },
      errors,
    });

    expect(counts?.moveIncreaseCount).toBe(2);
  });

  it('clamps a below-baseline characteristic with no recorded reduction to 0', async () => {
    positionRulesSets.listPositionRulesSets.mockResolvedValue([baseline()]);

    const counts = await service.forPlayer({
      player: { label: 'Grim (12)', positionId: 3 },
      rulesSet: BARE_RULES_SET,
      current: { move: 4, strength: 3, agility: 3, passing: 4, armour: 9 },
      reductions: NO_REDUCTIONS,
      errors,
    });

    expect(counts?.moveIncreaseCount).toBe(0);
  });

  it('treats an absent reductions group as all zeroes', async () => {
    positionRulesSets.listPositionRulesSets.mockResolvedValue([baseline()]);

    const counts = await service.forPlayer({
      player: { label: 'Grim (12)', positionId: 3 },
      rulesSet: BARE_RULES_SET,
      current: { move: 7, strength: 3, agility: 3, passing: 4, armour: 9 },
      reductions: undefined,
      errors,
    });

    expect(counts?.moveIncreaseCount).toBe(1);
  });

  it('sends 0 for Passing when the rules set declares none', async () => {
    positionRulesSets.listPositionRulesSets.mockResolvedValue([
      baseline({ passing: null }),
    ]);

    const counts = await service.forPlayer({
      player: { label: 'Grim (12)', positionId: 3 },
      rulesSet: { ...BARE_RULES_SET, passingFormat: 'absent' },
      current: { move: 6, strength: 3, agility: 3, passing: null, armour: 9 },
      reductions: NO_REDUCTIONS,
      errors,
    });

    expect(counts?.passingIncreaseCount).toBe(0);
    expect(errors).toEqual([]);
  });

  it('picks the baseline row matching the player rules set', async () => {
    positionRulesSets.listPositionRulesSets.mockResolvedValue([
      baseline({ rulesSetId: 99, move: 9 }),
      baseline({ rulesSetId: 7, move: 6 }),
    ]);

    const counts = await service.forPlayer({
      player: { label: 'Grim (12)', positionId: 3 },
      rulesSet: BARE_RULES_SET,
      current: { move: 7, strength: 3, agility: 3, passing: 4, armour: 9 },
      reductions: NO_REDUCTIONS,
      errors,
    });

    expect(counts?.moveIncreaseCount).toBe(1);
  });

  it('records an error and sends no group when no baseline row covers the rules set', async () => {
    positionRulesSets.listPositionRulesSets.mockResolvedValue([
      baseline({ rulesSetId: 99 }),
    ]);

    const counts = await service.forPlayer({
      player: { label: 'Grim (12)', positionId: 3 },
      rulesSet: BARE_RULES_SET,
      current: { move: 7, strength: 3, agility: 3, passing: 4, armour: 9 },
      reductions: NO_REDUCTIONS,
      errors,
    });

    expect(counts).toBeUndefined();
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Grim (12)');
    expect(errors[0].message).toContain('BB2020');
  });

  it('reports a missing baseline once per position and rules set, not once per player', async () => {
    positionRulesSets.listPositionRulesSets.mockResolvedValue([]);

    await service.forPlayer({
      player: { label: 'Grim (12)', positionId: 3 },
      rulesSet: BARE_RULES_SET,
      current: { move: 7, strength: 3, agility: 3, passing: 4, armour: 9 },
      reductions: NO_REDUCTIONS,
      errors,
    });
    await service.forPlayer({
      player: { label: 'Brak (13)', positionId: 3 },
      rulesSet: BARE_RULES_SET,
      current: { move: 7, strength: 3, agility: 3, passing: 4, armour: 9 },
      reductions: NO_REDUCTIONS,
      errors,
    });

    expect(errors).toHaveLength(1);
    expect(positionRulesSets.listPositionRulesSets).toHaveBeenCalledTimes(1);
  });

  it('adds no error of its own when the baseline read itself failed', async () => {
    positionRulesSets.listPositionRulesSets.mockResolvedValue(undefined);

    const counts = await service.forPlayer({
      player: { label: 'Grim (12)', positionId: 3 },
      rulesSet: BARE_RULES_SET,
      current: { move: 7, strength: 3, agility: 3, passing: 4, armour: 9 },
      reductions: NO_REDUCTIONS,
      errors,
    });

    expect(counts).toBeUndefined();
    expect(errors).toEqual([]);
  });

  it('uses a supplied baseline override instead of reading the DB baseline', async () => {
    const counts = await service.forPlayer({
      player: { label: 'Grim (12)', positionId: 3 },
      rulesSet: BARE_RULES_SET,
      current: { move: 8, strength: 3, agility: 3, passing: 4, armour: 9 },
      reductions: NO_REDUCTIONS,
      errors,
      baseline: { move: 6, strength: 3, agility: 3, passing: 4, armour: 9 },
    });

    expect(counts?.moveIncreaseCount).toBe(2);
    expect(positionRulesSets.listPositionRulesSets).not.toHaveBeenCalled();
  });

  it('falls back to the DB-read baseline when no override is supplied', async () => {
    positionRulesSets.listPositionRulesSets.mockResolvedValue([baseline()]);

    const counts = await service.forPlayer({
      player: { label: 'Grim (12)', positionId: 3 },
      rulesSet: BARE_RULES_SET,
      current: { move: 8, strength: 3, agility: 3, passing: 4, armour: 9 },
      reductions: NO_REDUCTIONS,
      errors,
    });

    expect(counts?.moveIncreaseCount).toBe(2);
    expect(positionRulesSets.listPositionRulesSets).toHaveBeenCalledTimes(1);
  });

  it('reads one position only once across players', async () => {
    positionRulesSets.listPositionRulesSets.mockResolvedValue([baseline()]);

    await service.forPlayer({
      player: { label: 'Grim (12)', positionId: 3 },
      rulesSet: BARE_RULES_SET,
      current: { move: 6, strength: 3, agility: 3, passing: 4, armour: 9 },
      reductions: NO_REDUCTIONS,
      errors,
    });
    await service.forPlayer({
      player: { label: 'Brak (13)', positionId: 3 },
      rulesSet: BARE_RULES_SET,
      current: { move: 6, strength: 3, agility: 3, passing: 4, armour: 9 },
      reductions: NO_REDUCTIONS,
      errors,
    });

    expect(positionRulesSets.listPositionRulesSets).toHaveBeenCalledTimes(1);
  });
});
