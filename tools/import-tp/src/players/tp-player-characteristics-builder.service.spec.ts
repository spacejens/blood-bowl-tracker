import type { TpPositionCharacteristics } from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { TpPlayerCharacteristicsBuilderService } from './tp-player-characteristics-builder.service';

const RULES_SET_IDS = new Map([
  ['Fourth era', 900],
  ['Fifth era', 901],
]);

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
        characteristics: {
          move: 6,
          strength: 4,
          agility: 3,
          passing: 5,
          armour: 10,
        },
        eraName: 'Fourth era',
        rulesSetIdByEraName: RULES_SET_IDS,
      }),
    ).toEqual({
      move: 6,
      strength: 4,
      agility: 3,
      passing: 5,
      armour: 10,
      rulesSetId: 900,
    });
  });

  it('carries a zero Passing through unchanged', () => {
    expect(
      service.forRosterPlayer({
        characteristics: {
          move: 5,
          strength: 3,
          agility: 4,
          passing: 0,
          armour: 9,
        },
        eraName: 'Fourth era',
        rulesSetIdByEraName: RULES_SET_IDS,
      })?.passing,
    ).toBe(0);
  });

  it('returns nothing when the player carries no characteristics', () => {
    expect(
      service.forRosterPlayer({
        characteristics: undefined,
        eraName: 'Fourth era',
        rulesSetIdByEraName: RULES_SET_IDS,
      }),
    ).toBeUndefined();
  });

  it('returns nothing when the era has no resolved rules set', () => {
    expect(
      service.forRosterPlayer({
        characteristics: {
          move: 6,
          strength: 4,
          agility: 3,
          passing: 5,
          armour: 10,
        },
        eraName: 'Sixth era',
        rulesSetIdByEraName: RULES_SET_IDS,
      }),
    ).toBeUndefined();
  });

  it("builds a payload from a star position's characteristics for that era's rules set", () => {
    const byPosition = new Map<number, Map<number, TpPositionCharacteristics>>([
      [
        70,
        new Map([
          [900, { move: 6, strength: 5, agility: 3, passing: 4, armour: 10 }],
          [901, { move: 7, strength: 5, agility: 3, passing: 4, armour: 10 }],
        ]),
      ],
    ]);

    expect(
      service.forStarPosition({
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

  it('returns nothing when the position has no characteristics at all', () => {
    expect(
      service.forStarPosition({
        positionId: 71,
        eraName: 'Fourth era',
        rulesSetIdByEraName: RULES_SET_IDS,
        characteristicsByPositionId: new Map(),
      }),
    ).toBeUndefined();
  });

  it("returns nothing when the position has no entry for the era's rules set", () => {
    const byPosition = new Map<number, Map<number, TpPositionCharacteristics>>([
      [
        70,
        new Map([
          [901, { move: 7, strength: 5, agility: 3, passing: 4, armour: 10 }],
        ]),
      ],
    ]);

    expect(
      service.forStarPosition({
        positionId: 70,
        eraName: 'Fourth era',
        rulesSetIdByEraName: RULES_SET_IDS,
        characteristicsByPositionId: byPosition,
      }),
    ).toBeUndefined();
  });

  it('returns nothing for a star position when the era has no resolved rules set', () => {
    const byPosition = new Map<number, Map<number, TpPositionCharacteristics>>([
      [
        70,
        new Map([
          [900, { move: 6, strength: 5, agility: 3, passing: 4, armour: 10 }],
        ]),
      ],
    ]);

    expect(
      service.forStarPosition({
        positionId: 70,
        eraName: 'Sixth era',
        rulesSetIdByEraName: RULES_SET_IDS,
        characteristicsByPositionId: byPosition,
      }),
    ).toBeUndefined();
  });
});
