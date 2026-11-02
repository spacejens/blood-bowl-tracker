import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { CharacteristicAdvancementPlannerService } from './characteristic-advancement-planner.service';
import type {
  ExistingRow,
  ResolvedPlayerSkill,
} from './player-advancement-sync.types';
import { PlayerAdvancementSyncPlannerService } from './player-advancement-sync-planner.service';

function existing(
  overrides: Partial<ExistingRow> & { id: number },
): ExistingRow {
  return {
    playerId: 1,
    skillId: 7,
    characteristic: null,
    source: 'chosen',
    attributeValue: null,
    advancementOrder: null,
    orderConfirmed: false,
    isFreeExtra: false,
    removed: false,
    ...overrides,
  };
}

function skill(
  overrides: Partial<ResolvedPlayerSkill> = {},
): ResolvedPlayerSkill {
  return {
    index: 0,
    playerId: 1,
    skillId: 7,
    source: 'chosen',
    attributeValue: null,
    advancementOrder: undefined,
    orderConfirmed: false,
    isFreeExtra: false,
    ...overrides,
  };
}

describe('PlayerAdvancementSyncPlannerService', () => {
  let planner: PlayerAdvancementSyncPlannerService;

  beforeEach(async () => {
    // The characteristic planner is passed real: a pure, dependency-free
    // decision service (CLAUDE.md, Testing services).
    const moduleRef = await Test.createTestingModule({
      providers: [
        PlayerAdvancementSyncPlannerService,
        CharacteristicAdvancementPlannerService,
      ],
    }).compile();
    planner = moduleRef.get(PlayerAdvancementSyncPlannerService);
  });

  describe('planSkills', () => {
    it('inserts an unmatched skill and matches a stored one by natural key', () => {
      const resultIds: number[] = [];
      const writes = planner.planSkills(
        [
          skill({ index: 0, advancementOrder: 2 }),
          skill({ index: 1, skillId: 8 }),
        ],
        [existing({ id: 40, advancementOrder: 2 })],
        resultIds,
      );
      expect(resultIds[0]).toBe(40);
      expect(writes.updates).toEqual([]);
      expect(writes.inserts).toEqual([
        {
          index: 1,
          values: {
            playerId: 1,
            skillId: 8,
            source: 'chosen',
            attributeValue: null,
            advancementOrder: null,
          },
        },
      ]);
      expect(writes.changedPlayerIds).toEqual([1]);
    });

    it('never matches a skill entry to a characteristic row', () => {
      const writes = planner.planSkills(
        [skill()],
        [
          existing({
            id: 70,
            skillId: null,
            characteristic: 'AG',
            source: 'characteristic',
          }),
        ],
        [],
      );
      expect(writes.inserts).toHaveLength(1);
    });

    it('keeps a stored chosen source when the entry only says advancement', () => {
      const writes = planner.planSkills(
        [skill({ source: 'advancement' })],
        [existing({ id: 40, source: 'chosen' })],
        [],
      );
      expect(writes.updates).toEqual([]);
    });

    it('keeps a confirmed order against an unconfirmed entry, but still marks it free', () => {
      const writes = planner.planSkills(
        [skill({ advancementOrder: 1, isFreeExtra: true })],
        [existing({ id: 40, advancementOrder: 3, orderConfirmed: true })],
        [],
      );
      expect(writes.updates).toEqual([
        { id: 40, values: { isFreeExtra: true } },
      ]);
    });
  });

  describe('planCharacteristics', () => {
    it('plans only the listed players, appending after their highest order', () => {
      const resultIds: number[] = [];
      const writes = planner.planCharacteristics(
        {
          characteristics: [
            {
              index: 1,
              playerId: 1,
              characteristic: 'ST',
              advancementOrder: undefined,
              orderConfirmed: false,
            },
          ],
          playerIds: new Set([1]),
          entries: [
            { playerId: 1, skillId: 7, source: 'chosen', advancementOrder: 2 },
            { playerId: 1, source: 'characteristic', characteristic: 'ST' },
          ],
        },
        [
          existing({ id: 40, advancementOrder: 5, removed: true }),
          existing({
            id: 80,
            playerId: 2,
            skillId: null,
            characteristic: 'AG',
            source: 'characteristic',
          }),
        ],
        resultIds,
      );
      expect(writes.inserts).toEqual([
        {
          index: 1,
          playerId: 1,
          characteristic: 'ST',
          advancementOrder: 3,
          orderConfirmed: false,
        },
      ]);
      expect(writes.updates).toEqual([]);
      expect(writes.changedPlayerIds).toEqual([1]);
    });

    it('reports no changed player when a listed player is unchanged', () => {
      const resultIds: number[] = [];
      const writes = planner.planCharacteristics(
        {
          characteristics: [
            {
              index: 0,
              playerId: 1,
              characteristic: 'AG',
              advancementOrder: 1,
              orderConfirmed: false,
            },
          ],
          playerIds: new Set([1]),
          entries: [],
        },
        [
          existing({
            id: 70,
            skillId: null,
            characteristic: 'AG',
            source: 'characteristic',
            advancementOrder: 1,
          }),
        ],
        resultIds,
      );
      expect(resultIds).toEqual([70]);
      expect(writes.changedPlayerIds).toEqual([]);
    });
  });
});
