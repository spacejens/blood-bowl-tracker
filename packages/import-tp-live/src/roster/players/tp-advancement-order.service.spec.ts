import type { PlayerSkillEntry } from '@blood-bowl-tracker/api-contract';
import type { PlayerCharacteristicCounts } from '@blood-bowl-tracker/domain-enums';
import type { StoredPlayerAdvancement } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { TpAdvancementOrderService } from './tp-advancement-order.service';

const counts = (
  overrides: Partial<PlayerCharacteristicCounts> = {},
): PlayerCharacteristicCounts => ({
  MA: 0,
  ST: 0,
  AG: 0,
  PA: 0,
  AV: 0,
  ...overrides,
});
const storedIncrease = (
  o: Partial<StoredPlayerAdvancement>,
): StoredPlayerAdvancement => ({
  skillId: null,
  attributeValue: null,
  characteristic: 'AG',
  source: 'characteristic',
  advancementOrder: null,
  orderConfirmed: false,
  isFreeExtra: false,
  ...o,
});
const storedSkill = (
  o: Partial<StoredPlayerAdvancement>,
): StoredPlayerAdvancement => ({
  skillId: 7,
  attributeValue: null,
  characteristic: null,
  source: 'chosen',
  advancementOrder: 1,
  orderConfirmed: false,
  isFreeExtra: false,
  ...o,
});
const gained = (skillId: number, order: number): PlayerSkillEntry => ({
  playerId: 1,
  skillId,
  source: 'chosen',
  attributeValue: null,
  advancementOrder: order,
});
const increaseEntry = (
  characteristic: PlayerSkillEntry['characteristic'],
  advancementOrder: number | null,
  orderConfirmed?: true,
): PlayerSkillEntry => ({
  playerId: 1,
  source: 'characteristic',
  characteristic,
  advancementOrder,
  ...(orderConfirmed ? { orderConfirmed } : {}),
});

describe('TpAdvancementOrderService', () => {
  let service: TpAdvancementOrderService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TpAdvancementOrderService],
    }).compile();
    service = moduleRef.get(TpAdvancementOrderService);
  });

  describe('characteristicEntries', () => {
    it('sends nothing when the increases are unknown', () => {
      expect(service.characteristicEntries(1, undefined)).toEqual([]);
    });

    it('sends one entry of unknown order per increase, in stat-line order', () => {
      expect(
        service.characteristicEntries(1, counts({ AV: 1, MA: 2 })),
      ).toEqual([
        increaseEntry('MA', null),
        increaseEntry('MA', null),
        increaseEntry('AV', null),
      ]);
    });
  });

  describe('liveEntries', () => {
    it('confirms nothing for a player with nothing stored', () => {
      expect(
        service.liveEntries({
          playerId: 1,
          skillEntries: [gained(7, 1)],
          increases: counts({ AG: 1 }),
          stored: [],
        }),
      ).toEqual({
        entries: [gained(7, 1), increaseEntry('AG', null)],
        pendingIndexes: [],
        firstNumber: 1,
      });
    });

    it('confirms a lone new increase at the number after the stored paid advancements', () => {
      // stored: skill 7 (paid), a free extra (not counted), one AG of unknown order (paid)
      expect(
        service.liveEntries({
          playerId: 1,
          skillEntries: [gained(7, 1), { ...gained(9, 2), isFreeExtra: true }],
          increases: counts({ AG: 2 }),
          stored: [
            storedSkill({}),
            storedSkill({ skillId: 9, advancementOrder: 2, isFreeExtra: true }),
            storedIncrease({}),
          ],
        }),
      ).toEqual({
        entries: [
          gained(7, 1),
          { ...gained(9, 2), isFreeExtra: true },
          increaseEntry('AG', null),
          increaseEntry('AG', 3, true),
        ],
        pendingIndexes: [],
        firstNumber: 3,
      });
    });

    it('never counts a stored starting skill as a paid advancement', () => {
      expect(
        service.liveEntries({
          playerId: 1,
          skillEntries: [],
          increases: counts({ ST: 1 }),
          stored: [
            storedSkill({
              skillId: 5,
              source: 'starting',
              advancementOrder: null,
            }),
            storedSkill({}),
          ],
        }),
      ).toEqual({
        entries: [increaseEntry('ST', 2, true)],
        pendingIndexes: [],
        firstNumber: 2,
      });
    });

    it('confirms a lone new skill', () => {
      expect(
        service.liveEntries({
          playerId: 1,
          skillEntries: [gained(7, 1), gained(8, 2)],
          increases: counts(),
          stored: [storedSkill({})],
        }),
      ).toEqual({
        entries: [gained(7, 1), { ...gained(8, 2), orderConfirmed: true }],
        pendingIndexes: [],
        firstNumber: 2,
      });
    });

    it('sends entries as they are when nothing is new', () => {
      expect(
        service.liveEntries({
          playerId: 1,
          skillEntries: [gained(7, 1)],
          increases: counts({ AG: 1 }),
          stored: [
            storedSkill({}),
            storedIncrease({ advancementOrder: 2, orderConfirmed: true }),
          ],
        }),
      ).toEqual({
        entries: [gained(7, 1), increaseEntry('AG', 2, true)],
        pendingIndexes: [],
        firstNumber: 3,
      });
    });

    it('leaves several new advancements pending, appended unconfirmed in fallback order', () => {
      expect(
        service.liveEntries({
          playerId: 1,
          skillEntries: [gained(7, 1), gained(8, 5)],
          increases: counts({ ST: 1 }),
          stored: [storedSkill({})],
        }),
      ).toEqual({
        entries: [gained(7, 1), gained(8, 2), increaseEntry('ST', 3)],
        pendingIndexes: [1, 2],
        firstNumber: 2,
      });
    });

    it('never counts a new free extra as a new advancement', () => {
      expect(
        service.liveEntries({
          playerId: 1,
          skillEntries: [
            gained(7, 1),
            { ...gained(9, 2), isFreeExtra: true },
            gained(8, 3),
          ],
          increases: counts(),
          stored: [storedSkill({})],
        }).entries[2],
      ).toEqual({ ...gained(8, 2), orderConfirmed: true });
    });

    it('resends only the best-ranked stored increases when the count fell', () => {
      expect(
        service.liveEntries({
          playerId: 1,
          skillEntries: [],
          increases: counts({ AG: 1 }),
          stored: [
            storedIncrease({ advancementOrder: null }),
            storedIncrease({ advancementOrder: 4, orderConfirmed: true }),
          ],
        }).entries,
      ).toEqual([increaseEntry('AG', 4, true)]);
    });

    it('prefers an ordered stored increase over an unordered one', () => {
      expect(
        service.liveEntries({
          playerId: 1,
          skillEntries: [],
          increases: counts({ AG: 1 }),
          stored: [
            storedIncrease({ advancementOrder: null }),
            storedIncrease({ advancementOrder: 3 }),
          ],
        }).entries,
      ).toEqual([increaseEntry('AG', 3)]);
    });

    it('sends only the skills when the increases are unknown', () => {
      expect(
        service.liveEntries({
          playerId: 1,
          skillEntries: [gained(7, 1)],
          increases: undefined,
          stored: [storedSkill({})],
        }).entries,
      ).toEqual([gained(7, 1)]);
    });
  });
});
