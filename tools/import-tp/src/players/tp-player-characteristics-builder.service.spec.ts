import type { TpPositionCharacteristics } from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { TpPlayerCharacteristicsBuilderService } from './tp-player-characteristics-builder.service';

const RULES_SET_IDS = new Map([
  ['Fourth era', 900],
  ['Fifth era', 901],
]);

const OWN = {
  move: 6,
  strength: 4,
  agility: 3,
  passing: 5,
  armour: 10,
};

function byPositionWith(
  positionId: number,
  entries: [number, TpPositionCharacteristics][],
): Map<number, Map<number, TpPositionCharacteristics>> {
  return new Map([[positionId, new Map(entries)]]);
}

describe('TpPlayerCharacteristicsBuilderService', () => {
  let service: TpPlayerCharacteristicsBuilderService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TpPlayerCharacteristicsBuilderService],
    }).compile();
    service = moduleRef.get(TpPlayerCharacteristicsBuilderService);
  });

  it("builds a full payload from a player's own characteristics", () => {
    expect(
      service.forRosterPlayer({
        characteristics: OWN,
        positionId: 70,
        eraName: 'Fourth era',
        rulesSetIdByEraName: RULES_SET_IDS,
      }),
    ).toEqual({ ...OWN, rulesSetId: 900 });
  });

  it('carries a zero Passing through unchanged', () => {
    expect(
      service.forRosterPlayer({
        characteristics: { ...OWN, passing: 0 },
        positionId: 70,
        eraName: 'Fourth era',
        rulesSetIdByEraName: RULES_SET_IDS,
      })?.passing,
    ).toBe(0);
  });

  it("prefers the player's own characteristics over the position fallback when both are available", () => {
    const byPosition = byPositionWith(70, [
      [900, { move: 1, strength: 1, agility: 1, passing: 1, armour: 1 }],
    ]);

    expect(
      service.forRosterPlayer({
        characteristics: OWN,
        positionId: 70,
        eraName: 'Fourth era',
        rulesSetIdByEraName: RULES_SET_IDS,
        characteristicsByPositionId: byPosition,
      }),
    ).toEqual({ ...OWN, rulesSetId: 900 });
  });

  it("falls back to the recruited position's characteristics when the player carries none of their own", () => {
    const byPosition = byPositionWith(70, [
      [900, { move: 6, strength: 5, agility: 3, passing: 4, armour: 10 }],
      [901, { move: 7, strength: 5, agility: 3, passing: 4, armour: 10 }],
    ]);

    expect(
      service.forRosterPlayer({
        characteristics: undefined,
        positionId: 70,
        eraName: 'Fourth era',
        rulesSetIdByEraName: RULES_SET_IDS,
        characteristicsByPositionId: byPosition,
      }),
    ).toEqual({
      move: 6,
      strength: 5,
      agility: 3,
      passing: 4,
      armour: 10,
      rulesSetId: 900,
    });
  });

  it('returns nothing when the player carries no characteristics and no position fallback map is given', () => {
    expect(
      service.forRosterPlayer({
        characteristics: undefined,
        positionId: 70,
        eraName: 'Fourth era',
        rulesSetIdByEraName: RULES_SET_IDS,
      }),
    ).toBeUndefined();
  });

  it('returns nothing when the player carries no characteristics and the position has none either', () => {
    expect(
      service.forRosterPlayer({
        characteristics: undefined,
        positionId: 71,
        eraName: 'Fourth era',
        rulesSetIdByEraName: RULES_SET_IDS,
        characteristicsByPositionId: new Map(),
      }),
    ).toBeUndefined();
  });

  it("returns nothing when the player carries no characteristics and the position has none for the era's rules set", () => {
    const byPosition = byPositionWith(70, [
      [901, { move: 7, strength: 5, agility: 3, passing: 4, armour: 10 }],
    ]);

    expect(
      service.forRosterPlayer({
        characteristics: undefined,
        positionId: 70,
        eraName: 'Fourth era',
        rulesSetIdByEraName: RULES_SET_IDS,
        characteristicsByPositionId: byPosition,
      }),
    ).toBeUndefined();
  });

  it('returns nothing when the era has no resolved rules set, even with characteristics present', () => {
    expect(
      service.forRosterPlayer({
        characteristics: OWN,
        positionId: 70,
        eraName: 'Sixth era',
        rulesSetIdByEraName: RULES_SET_IDS,
      }),
    ).toBeUndefined();
  });

  it('returns nothing for a position-only fallback when the era has no resolved rules set', () => {
    const byPosition = byPositionWith(70, [
      [900, { move: 6, strength: 5, agility: 3, passing: 4, armour: 10 }],
    ]);

    expect(
      service.forRosterPlayer({
        characteristics: undefined,
        positionId: 70,
        eraName: 'Sixth era',
        rulesSetIdByEraName: RULES_SET_IDS,
        characteristicsByPositionId: byPosition,
      }),
    ).toBeUndefined();
  });
});
