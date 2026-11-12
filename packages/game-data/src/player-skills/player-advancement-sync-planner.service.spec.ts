import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { CharacteristicAdvancementPlannerService } from './characteristic-advancement-planner.service';
import type {
  ExistingRow,
  ResolvedCharacteristic,
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

  describe('isFreeExtra', () => {
    const facts = {
      freeExtraSkillIds: new Set<number>(),
      grantedSkillIdsByPlayer: new Map([[1, new Set([7])]]),
    };

    const nameFacts = {
      freeExtraSkillIds: new Set([9]),
      grantedSkillIdsByPlayer: new Map<number, Set<number>>(),
    };

    it('is free for a gained skill the name rule covers (Hatred, Loner)', () => {
      expect(
        planner.isFreeExtra(
          { playerId: 1, skillId: 9, source: 'advancement' },
          9,
          nameFacts,
        ),
      ).toBe(true);
    });

    it('is not free for a starting skill the name rule covers', () => {
      expect(
        planner.isFreeExtra(
          { playerId: 1, skillId: 9, source: 'starting' },
          9,
          nameFacts,
        ),
      ).toBe(false);
    });

    it('is free for a gained skill a trophy grants', () => {
      expect(
        planner.isFreeExtra(
          { playerId: 1, skillId: 7, source: 'advancement' },
          7,
          facts,
        ),
      ).toBe(true);
    });

    it('is not free for a starting skill a trophy grants', () => {
      expect(
        planner.isFreeExtra(
          { playerId: 1, skillId: 7, source: 'starting' },
          7,
          facts,
        ),
      ).toBe(false);
    });

    it('stays free for a starting skill the source flags', () => {
      expect(
        planner.isFreeExtra(
          { playerId: 1, skillId: 7, source: 'starting', isFreeExtra: true },
          7,
          facts,
        ),
      ).toBe(true);
    });
  });

  describe('grantedSkillIdsByPlayer', () => {
    it("groups each player's granted skills, skipping awards that grant nothing", () => {
      expect(
        planner.grantedSkillIdsByPlayer([
          { playerId: 1, grantedSkillId: 7 },
          { playerId: 1, grantedSkillId: 8 },
          { playerId: 2, grantedSkillId: 7 },
          { playerId: 3, grantedSkillId: null },
          { playerId: null, grantedSkillId: 9 },
        ]),
      ).toEqual(
        new Map([
          [1, new Set([7, 8])],
          [2, new Set([7])],
        ]),
      );
    });
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

    it('keeps a confirmed order against an unconfirmed entry', () => {
      const writes = planner.planSkills(
        [skill({ advancementOrder: 1 })],
        [existing({ id: 40, advancementOrder: 3, orderConfirmed: true })],
        [],
      );
      expect(writes.updates).toEqual([]);
    });

    it('unconfirms a confirmed row it marks free, taking the entry order', () => {
      const writes = planner.planSkills(
        [skill({ advancementOrder: 1, isFreeExtra: true })],
        [existing({ id: 40, advancementOrder: 3, orderConfirmed: true })],
        [],
      );
      expect(writes.updates).toEqual([
        {
          id: 40,
          values: {
            advancementOrder: 1,
            orderConfirmed: false,
            isFreeExtra: true,
          },
        },
      ]);
    });

    it('never confirms a stored free row, even for a confirmed entry', () => {
      const writes = planner.planSkills(
        [skill({ advancementOrder: 2, orderConfirmed: true })],
        [existing({ id: 40, advancementOrder: 2, isFreeExtra: true })],
        [],
      );
      expect(writes.updates).toEqual([]);
    });

    it('never inserts a free row confirmed', () => {
      const writes = planner.planSkills(
        [
          skill({
            advancementOrder: 2,
            orderConfirmed: true,
            isFreeExtra: true,
          }),
        ],
        [],
        [],
      );
      expect(writes.inserts[0]?.values).not.toHaveProperty('orderConfirmed');
      expect(writes.inserts[0]?.values).toMatchObject({
        advancementOrder: 2,
        isFreeExtra: true,
      });
    });
  });

  describe('closeFreeExtraSlots', () => {
    function increase(
      overrides: Partial<ResolvedCharacteristic> = {},
    ): ResolvedCharacteristic {
      return {
        index: 0,
        playerId: 1,
        characteristic: 'ST',
        advancementOrder: undefined,
        orderConfirmed: false,
        ...overrides,
      };
    }

    /** A confirmed paid skill of player 1 at `order`. */
    function paid(skillId: number, order: number): ResolvedPlayerSkill {
      return skill({
        index: skillId,
        skillId,
        advancementOrder: order,
        orderConfirmed: true,
      });
    }

    /** A confirmed free extra of player 1 at `order`. */
    function free(skillId: number, order: number): ResolvedPlayerSkill {
      return { ...paid(skillId, order), isFreeExtra: true };
    }

    function orders(resolved: { skills: ResolvedPlayerSkill[] }): unknown[] {
      return resolved.skills.map((row) => [
        row.skillId,
        row.advancementOrder,
        row.orderConfirmed,
      ]);
    }

    it('closes the slot of a free extra in the middle of the page order', () => {
      const result = planner.closeFreeExtraSlots(
        {
          skills: [paid(10, 1), free(11, 2), paid(12, 3), paid(13, 4)],
          characteristics: [],
        },
        [],
      );
      expect(orders(result)).toEqual([
        [10, 1, true],
        [11, 2, false],
        [12, 2, true],
        [13, 3, true],
      ]);
    });

    it('closes the slot of a free extra listed first', () => {
      const result = planner.closeFreeExtraSlots(
        {
          skills: [free(11, 1), paid(12, 2), paid(13, 3)],
          characteristics: [],
        },
        [],
      );
      expect(orders(result)).toEqual([
        [11, 1, false],
        [12, 1, true],
        [13, 2, true],
      ]);
    });

    it('only unconfirms a free extra listed last', () => {
      const result = planner.closeFreeExtraSlots(
        {
          skills: [paid(10, 1), paid(12, 2), free(11, 3)],
          characteristics: [],
        },
        [],
      );
      expect(orders(result)).toEqual([
        [10, 1, true],
        [12, 2, true],
        [11, 3, false],
      ]);
    });

    it('closes the slots of two free extras of one player', () => {
      const result = planner.closeFreeExtraSlots(
        {
          skills: [
            paid(10, 1),
            free(11, 2),
            paid(12, 3),
            free(14, 4),
            paid(13, 5),
          ],
          characteristics: [
            increase({ index: 5, advancementOrder: 6, orderConfirmed: true }),
          ],
        },
        [],
      );
      expect(orders(result)).toEqual([
        [10, 1, true],
        [11, 2, false],
        [12, 2, true],
        [14, 4, false],
        [13, 3, true],
      ]);
      expect(result.characteristics.map((row) => row.advancementOrder)).toEqual(
        [4],
      );
    });

    it('leaves a batch without a free extra unchanged', () => {
      const resolved = {
        skills: [paid(10, 1), paid(12, 2)],
        characteristics: [
          increase({ index: 5, advancementOrder: 3, orderConfirmed: true }),
        ],
      };
      expect(planner.closeFreeExtraSlots(resolved, [])).toEqual(resolved);
    });

    it('renumbers increases together with skills', () => {
      const result = planner.closeFreeExtraSlots(
        {
          skills: [free(11, 1), paid(12, 3)],
          characteristics: [
            increase({ index: 5, advancementOrder: 2, orderConfirmed: true }),
            increase({ index: 6, advancementOrder: 4, orderConfirmed: true }),
            increase({ index: 7, advancementOrder: undefined }),
          ],
        },
        [],
      );
      expect(orders(result)).toEqual([
        [11, 1, false],
        [12, 2, true],
      ]);
      expect(result.characteristics.map((row) => row.advancementOrder)).toEqual(
        [1, 3, undefined],
      );
    });

    it('treats a row stored as free as a free extra', () => {
      const result = planner.closeFreeExtraSlots(
        { skills: [paid(11, 1), paid(12, 2)], characteristics: [] },
        [existing({ id: 40, skillId: 11, isFreeExtra: true })],
      );
      expect(orders(result)).toEqual([
        [11, 1, false],
        [12, 1, true],
      ]);
    });

    it('leaves unconfirmed orders and other players alone', () => {
      const result = planner.closeFreeExtraSlots(
        {
          skills: [
            { ...free(11, 1), orderConfirmed: false },
            skill({ index: 2, skillId: 12, advancementOrder: 2 }),
            { ...paid(13, 3), playerId: 2 },
            { ...free(14, 2), playerId: 3 },
            paid(15, 3),
          ],
          characteristics: [],
        },
        [],
      );
      expect(
        result.skills.map((row) => [row.skillId, row.advancementOrder]),
      ).toEqual([
        [11, 1],
        [12, 2],
        [13, 3],
        [14, 2],
        [15, 3],
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
