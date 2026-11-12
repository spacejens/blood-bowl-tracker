import type { PlayerSkillEntry } from '@blood-bowl-tracker/api-contract';
import {
  DB,
  playerAdvancements,
  skills,
  trophyAwards,
} from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import {
  extractAllFilterValues,
  firstCallArg,
  mockDb,
} from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { CharacteristicAdvancementPlannerService } from './characteristic-advancement-planner.service';
import { PlayerAdvancementReadsService } from './player-advancement-reads.service';
import { PlayerAdvancementSyncPlannerService } from './player-advancement-sync-planner.service';

async function makeService(
  db: MockDbResult,
): Promise<PlayerAdvancementReadsService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      PlayerAdvancementReadsService,
      // Pure decision chain (CLAUDE.md, Testing services), passed real.
      PlayerAdvancementSyncPlannerService,
      CharacteristicAdvancementPlannerService,
      { provide: DB, useValue: db.db },
    ],
  }).compile();
  return moduleRef.get(PlayerAdvancementReadsService);
}

describe('PlayerAdvancementReadsService', () => {
  it("lists the player's active increases", async () => {
    const db = mockDb([
      { characteristic: 'AG', advancementOrder: 2, orderConfirmed: true },
    ]);
    const service = await makeService(db);

    expect(await service.listCharacteristicAdvancements(1)).toEqual([
      { characteristic: 'AG', advancementOrder: 2, orderConfirmed: true },
    ]);
    expect(db.chains[0].from).toHaveBeenCalledWith(playerAdvancements);
    expect(extractAllFilterValues(firstCallArg(db.chains[0].where))).toEqual([
      1,
      'characteristic',
      false,
    ]);
  });

  it('drops a row with no characteristic', async () => {
    const db = mockDb([
      { characteristic: null, advancementOrder: null, orderConfirmed: false },
    ]);
    const service = await makeService(db);

    expect(await service.listCharacteristicAdvancements(1)).toEqual([]);
  });

  it('lists every active row of the player', async () => {
    const row = {
      skillId: 7,
      attributeValue: null,
      characteristic: null,
      source: 'chosen',
      advancementOrder: 1,
      orderConfirmed: false,
      isFreeExtra: false,
    };
    const db = mockDb([row]);
    const service = await makeService(db);

    expect(await service.listStoredAdvancements(1)).toEqual([row]);
    expect(extractAllFilterValues(firstCallArg(db.chains[0].where))).toEqual([
      1,
      false,
    ]);
  });

  describe('resolveFreeExtras', () => {
    const gained = (skillId: number, playerId = 1): PlayerSkillEntry => ({
      playerId,
      skillId,
      source: 'chosen',
      advancementOrder: 1,
    });

    it('queries nothing when no gained skill is left unflagged', async () => {
      const db = mockDb();
      const service = await makeService(db);
      const entries: PlayerSkillEntry[] = [
        { playerId: 1, skillId: 5, source: 'starting' },
        { ...gained(7), isFreeExtra: true },
        { playerId: 1, source: 'characteristic', characteristic: 'AG' },
      ];

      expect(await service.resolveFreeExtras(entries)).toBe(entries);
      expect(db.chains).toHaveLength(0);
    });

    it("flags a gained skill one of the player's own trophy awards grants", async () => {
      const db = mockDb([], [{ playerId: 1, grantedSkillId: 7 }]);
      const service = await makeService(db);

      expect(await service.resolveFreeExtras([gained(7), gained(8)])).toEqual([
        { ...gained(7), isFreeExtra: true },
        gained(8),
      ]);
      expect(db.chains[0].from).toHaveBeenCalledWith(skills);
      expect(extractAllFilterValues(firstCallArg(db.chains[0].where))).toEqual([
        7,
        8,
        'Hatred',
        'Loner',
      ]);
      expect(db.chains[1].from).toHaveBeenCalledWith(trophyAwards);
      expect(extractAllFilterValues(firstCallArg(db.chains[1].where))).toEqual([
        1, 7, 8,
      ]);
    });

    it("leaves a skill another player's award grants unflagged", async () => {
      const db = mockDb([], [{ playerId: 2, grantedSkillId: 7 }]);
      const service = await makeService(db);

      expect(await service.resolveFreeExtras([gained(7)])).toEqual([gained(7)]);
    });

    it('flags a gained Hatred but never a starting one', async () => {
      const db = mockDb([{ id: 9 }], []);
      const service = await makeService(db);
      const startingHatred: PlayerSkillEntry = {
        playerId: 1,
        skillId: 9,
        source: 'starting',
      };

      expect(
        await service.resolveFreeExtras([startingHatred, gained(9, 2)]),
      ).toEqual([startingHatred, { ...gained(9, 2), isFreeExtra: true }]);
    });

    it('flags a gained Loner but never a starting one', async () => {
      // The mocked skills query returns the row the name filter matched.
      const db = mockDb([{ id: 9 }], []);
      const service = await makeService(db);
      const startingLoner: PlayerSkillEntry = {
        playerId: 1,
        skillId: 9,
        source: 'starting',
      };

      expect(
        await service.resolveFreeExtras([startingLoner, gained(9, 2)]),
      ).toEqual([startingLoner, { ...gained(9, 2), isFreeExtra: true }]);
    });

    it('keeps an entry the source already flags free', async () => {
      const db = mockDb([], []);
      const service = await makeService(db);
      const flagged: PlayerSkillEntry = { ...gained(7), isFreeExtra: true };

      expect(await service.resolveFreeExtras([flagged, gained(8)])).toEqual([
        flagged,
        gained(8),
      ]);
    });
  });
});
