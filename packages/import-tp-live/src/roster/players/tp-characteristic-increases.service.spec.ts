import type { ImportError, RulesSet } from '@blood-bowl-tracker/api-contract';
import type { PositionCharacteristics } from '@blood-bowl-tracker/game-data';
import { PositionRulesSetsService } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpImportResultsService } from '../../tp-import-results.service';
import { TpUpsertRunnerService } from '../../tp-upsert-runner.service';
import { TpCharacteristicIncreasesService } from './tp-characteristic-increases.service';

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
  overrides: Partial<PositionCharacteristics> = {},
): PositionCharacteristics {
  return {
    rulesSetId: 7,
    rulesSetName: 'BB2020',
    moveFormat: 'bare',
    move: 6,
    strengthFormat: 'bare',
    strength: 3,
    agilityFormat: 'plus',
    agility: 3,
    passingFormat: 'plus',
    passing: 4,
    armourFormat: 'plus',
    armour: 9,
    ...overrides,
  };
}

describe('TpCharacteristicIncreasesService', () => {
  let service: TpCharacteristicIncreasesService;
  let positionRulesSets: MockProxy<PositionRulesSetsService>;
  let errors: ImportError[];

  beforeEach(async () => {
    positionRulesSets = mock<PositionRulesSetsService>();
    errors = [];
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpCharacteristicIncreasesService,
        TpImportResultsService,
        TpUpsertRunnerService,
        { provide: PositionRulesSetsService, useValue: positionRulesSets },
      ],
    }).compile();
    service = moduleRef.get(TpCharacteristicIncreasesService);
  });

  it('reports no increases for a player who matches the baseline', async () => {
    positionRulesSets.listByPosition.mockResolvedValue([baseline()]);

    const counts = await service.forPlayer({
      player: { label: 'Grim (12)', positionId: 3 },
      rulesSet: BARE_RULES_SET,
      current: { move: 6, strength: 3, agility: 3, passing: 4, armour: 9 },
      reductions: NO_REDUCTIONS,
      baseline: undefined,
      cache: service.newCache(),
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
    positionRulesSets.listByPosition.mockResolvedValue([baseline()]);

    const counts = await service.forPlayer({
      player: { label: 'Grim (12)', positionId: 3 },
      rulesSet: BARE_RULES_SET,
      current: { move: 8, strength: 4, agility: 3, passing: 4, armour: 9 },
      reductions: NO_REDUCTIONS,
      baseline: undefined,
      cache: service.newCache(),
      errors,
    });

    expect(counts?.moveIncreaseCount).toBe(2);
    expect(counts?.strengthIncreaseCount).toBe(1);
  });

  it('counts a roll-target characteristic that is LOWER than the baseline', async () => {
    positionRulesSets.listByPosition.mockResolvedValue([baseline()]);

    const counts = await service.forPlayer({
      player: { label: 'Grim (12)', positionId: 3 },
      rulesSet: BARE_RULES_SET,
      current: { move: 6, strength: 3, agility: 2, passing: 3, armour: 9 },
      reductions: NO_REDUCTIONS,
      baseline: undefined,
      cache: service.newCache(),
      errors,
    });

    expect(counts?.agilityIncreaseCount).toBe(1);
    expect(counts?.passingIncreaseCount).toBe(1);
  });

  it('counts armour upward even under a roll-target format', async () => {
    positionRulesSets.listByPosition.mockResolvedValue([baseline()]);

    const counts = await service.forPlayer({
      player: { label: 'Grim (12)', positionId: 3 },
      rulesSet: BARE_RULES_SET,
      current: { move: 6, strength: 3, agility: 3, passing: 4, armour: 10 },
      reductions: NO_REDUCTIONS,
      baseline: undefined,
      cache: service.newCache(),
      errors,
    });

    expect(counts?.armourIncreaseCount).toBe(1);
  });

  it('adds back an outstanding reduction that is masking an increase', async () => {
    positionRulesSets.listByPosition.mockResolvedValue([baseline()]);

    const counts = await service.forPlayer({
      player: { label: 'Grim (12)', positionId: 3 },
      rulesSet: BARE_RULES_SET,
      current: { move: 6, strength: 3, agility: 3, passing: 4, armour: 9 },
      reductions: { ...NO_REDUCTIONS, moveReductionCount: 2 },
      baseline: undefined,
      cache: service.newCache(),
      errors,
    });

    expect(counts?.moveIncreaseCount).toBe(2);
  });

  it('clamps a below-baseline characteristic with no recorded reduction to 0', async () => {
    positionRulesSets.listByPosition.mockResolvedValue([baseline()]);

    const counts = await service.forPlayer({
      player: { label: 'Grim (12)', positionId: 3 },
      rulesSet: BARE_RULES_SET,
      current: { move: 4, strength: 3, agility: 3, passing: 4, armour: 9 },
      reductions: NO_REDUCTIONS,
      baseline: undefined,
      cache: service.newCache(),
      errors,
    });

    expect(counts?.moveIncreaseCount).toBe(0);
  });

  it('treats an absent reductions group as all zeroes', async () => {
    positionRulesSets.listByPosition.mockResolvedValue([baseline()]);

    const counts = await service.forPlayer({
      player: { label: 'Grim (12)', positionId: 3 },
      rulesSet: BARE_RULES_SET,
      current: { move: 7, strength: 3, agility: 3, passing: 4, armour: 9 },
      reductions: undefined,
      baseline: undefined,
      cache: service.newCache(),
      errors,
    });

    expect(counts?.moveIncreaseCount).toBe(1);
  });

  it('sends 0 for Passing when the rules set declares none', async () => {
    positionRulesSets.listByPosition.mockResolvedValue([
      baseline({ passing: null }),
    ]);

    const counts = await service.forPlayer({
      player: { label: 'Grim (12)', positionId: 3 },
      rulesSet: { ...BARE_RULES_SET, passingFormat: 'absent' },
      current: { move: 6, strength: 3, agility: 3, passing: null, armour: 9 },
      reductions: NO_REDUCTIONS,
      baseline: undefined,
      cache: service.newCache(),
      errors,
    });

    expect(counts?.passingIncreaseCount).toBe(0);
    expect(errors).toEqual([]);
  });

  it('picks the baseline row matching the player rules set', async () => {
    positionRulesSets.listByPosition.mockResolvedValue([
      baseline({ rulesSetId: 99, move: 9 }),
      baseline({ rulesSetId: 7, move: 6 }),
    ]);

    const counts = await service.forPlayer({
      player: { label: 'Grim (12)', positionId: 3 },
      rulesSet: BARE_RULES_SET,
      current: { move: 7, strength: 3, agility: 3, passing: 4, armour: 9 },
      reductions: NO_REDUCTIONS,
      baseline: undefined,
      cache: service.newCache(),
      errors,
    });

    expect(counts?.moveIncreaseCount).toBe(1);
  });

  it('records an error and sends no group when no baseline row covers the rules set', async () => {
    positionRulesSets.listByPosition.mockResolvedValue([
      baseline({ rulesSetId: 99 }),
    ]);

    const counts = await service.forPlayer({
      player: { label: 'Grim (12)', positionId: 3 },
      rulesSet: BARE_RULES_SET,
      current: { move: 7, strength: 3, agility: 3, passing: 4, armour: 9 },
      reductions: NO_REDUCTIONS,
      baseline: undefined,
      cache: service.newCache(),
      errors,
    });

    expect(counts).toBeUndefined();
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Grim (12)');
    expect(errors[0].message).toContain('BB2020');
  });

  it('reports a missing baseline once per position and rules set, not once per player', async () => {
    positionRulesSets.listByPosition.mockResolvedValue([]);
    const cache = service.newCache();

    await service.forPlayer({
      player: { label: 'Grim (12)', positionId: 3 },
      rulesSet: BARE_RULES_SET,
      current: { move: 7, strength: 3, agility: 3, passing: 4, armour: 9 },
      reductions: NO_REDUCTIONS,
      baseline: undefined,
      cache,
      errors,
    });
    await service.forPlayer({
      player: { label: 'Brak (13)', positionId: 3 },
      rulesSet: BARE_RULES_SET,
      current: { move: 7, strength: 3, agility: 3, passing: 4, armour: 9 },
      reductions: NO_REDUCTIONS,
      baseline: undefined,
      cache,
      errors,
    });

    expect(errors).toHaveLength(1);
    expect(positionRulesSets.listByPosition).toHaveBeenCalledTimes(1);
  });

  it('adds no error of its own when the baseline read itself failed', async () => {
    positionRulesSets.listByPosition.mockRejectedValue(new Error('boom'));

    const counts = await service.forPlayer({
      player: { label: 'Grim (12)', positionId: 12 },
      rulesSet: BARE_RULES_SET,
      current: { move: 7, strength: 3, agility: 3, passing: 4, armour: 9 },
      reductions: NO_REDUCTIONS,
      baseline: undefined,
      cache: service.newCache(),
      errors,
    });

    expect(counts).toBeUndefined();
    expect(errors.map((error) => error.message)).toEqual([
      'Failed to list characteristics for position 12: boom',
    ]);
  });

  it('uses a supplied baseline override instead of reading the DB baseline', async () => {
    const counts = await service.forPlayer({
      player: { label: 'Grim (12)', positionId: 3 },
      rulesSet: BARE_RULES_SET,
      current: { move: 8, strength: 3, agility: 3, passing: 4, armour: 9 },
      reductions: NO_REDUCTIONS,
      baseline: { move: 6, strength: 3, agility: 3, passing: 4, armour: 9 },
      cache: service.newCache(),
      errors,
    });

    expect(counts?.moveIncreaseCount).toBe(2);
    expect(positionRulesSets.listByPosition).not.toHaveBeenCalled();
  });

  it('falls back to the DB-read baseline when no override is supplied', async () => {
    positionRulesSets.listByPosition.mockResolvedValue([baseline()]);

    const counts = await service.forPlayer({
      player: { label: 'Grim (12)', positionId: 3 },
      rulesSet: BARE_RULES_SET,
      current: { move: 8, strength: 3, agility: 3, passing: 4, armour: 9 },
      reductions: NO_REDUCTIONS,
      baseline: undefined,
      cache: service.newCache(),
      errors,
    });

    expect(counts?.moveIncreaseCount).toBe(2);
    expect(positionRulesSets.listByPosition).toHaveBeenCalledTimes(1);
  });

  it('reads one position only once across players', async () => {
    positionRulesSets.listByPosition.mockResolvedValue([baseline()]);
    const cache = service.newCache();

    await service.forPlayer({
      player: { label: 'Grim (12)', positionId: 3 },
      rulesSet: BARE_RULES_SET,
      current: { move: 6, strength: 3, agility: 3, passing: 4, armour: 9 },
      reductions: NO_REDUCTIONS,
      baseline: undefined,
      cache,
      errors,
    });
    await service.forPlayer({
      player: { label: 'Brak (13)', positionId: 3 },
      rulesSet: BARE_RULES_SET,
      current: { move: 6, strength: 3, agility: 3, passing: 4, armour: 9 },
      reductions: NO_REDUCTIONS,
      baseline: undefined,
      cache,
      errors,
    });

    expect(positionRulesSets.listByPosition).toHaveBeenCalledTimes(1);
  });

  it('reads the baseline again with a fresh cache', async () => {
    positionRulesSets.listByPosition.mockResolvedValue([baseline()]);

    await service.forPlayer({
      player: { label: 'Grim (12)', positionId: 3 },
      rulesSet: BARE_RULES_SET,
      current: { move: 6, strength: 3, agility: 3, passing: 4, armour: 9 },
      reductions: NO_REDUCTIONS,
      baseline: undefined,
      cache: service.newCache(),
      errors,
    });
    await service.forPlayer({
      player: { label: 'Brak (13)', positionId: 3 },
      rulesSet: BARE_RULES_SET,
      current: { move: 6, strength: 3, agility: 3, passing: 4, armour: 9 },
      reductions: NO_REDUCTIONS,
      baseline: undefined,
      cache: service.newCache(),
      errors,
    });

    expect(positionRulesSets.listByPosition).toHaveBeenCalledTimes(2);
  });
});
