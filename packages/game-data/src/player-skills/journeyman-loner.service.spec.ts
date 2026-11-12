import { DB, playerAdvancements } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import {
  extractAllFilterValues,
  extractJoinColumns,
  firstCallArg,
  mockDb,
  sqlText,
} from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { JourneymanLonerService } from './journeyman-loner.service';
import { PaidAdvancementSlotsService } from './paid-advancement-slots.service';

const loner = (overrides: Record<string, unknown>) => ({
  id: 10,
  source: 'starting',
  advancementOrder: null,
  orderConfirmed: false,
  isFreeExtra: false,
  removed: false,
  ...overrides,
});

describe('JourneymanLonerService', () => {
  let slots: MockProxy<PaidAdvancementSlotsService>;

  beforeEach(() => {
    slots = mock<PaidAdvancementSlotsService>();
  });

  // Query order: chain 0 = the Loner skill lookup, chain 1 = the player's
  // Loner rows (inside the transaction), then writes.
  async function makeService(
    db: MockDbResult,
  ): Promise<JourneymanLonerService> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        JourneymanLonerService,
        { provide: PaidAdvancementSlotsService, useValue: slots },
        { provide: DB, useValue: db.db },
      ],
    }).compile();
    return moduleRef.get(JourneymanLonerService);
  }

  describe('ensureStartingLoner', () => {
    it('does nothing when no skill is named Loner', async () => {
      const db = mockDb([]);
      const service = await makeService(db);

      await service.ensureStartingLoner(1);

      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('inserts a starting Loner when the player has none', async () => {
      const db = mockDb([{ id: 7 }], []);
      const service = await makeService(db);

      await service.ensureStartingLoner(1);

      expect(db.db.insert).toHaveBeenCalledWith(playerAdvancements);
      expect(db.chains[2].values).toHaveBeenCalledWith({
        playerId: 1,
        skillId: 7,
        source: 'starting',
      });
      expect(db.db.update).not.toHaveBeenCalled();
    });

    it('writes nothing when an active starting Loner exists', async () => {
      const db = mockDb([{ id: 7 }], [loner({})]);
      const service = await makeService(db);

      await service.ensureStartingLoner(1);

      expect(db.db.update).not.toHaveBeenCalled();
      expect(db.db.insert).not.toHaveBeenCalled();
    });

    it('revives a removed starting Loner', async () => {
      const db = mockDb([{ id: 7 }], [loner({ removed: true })]);
      const service = await makeService(db);

      await service.ensureStartingLoner(1);

      expect(db.db.update).toHaveBeenCalledTimes(1);
      expect(db.chains[2].set).toHaveBeenCalledWith({ removed: false });
      expect(extractAllFilterValues(firstCallArg(db.chains[2].where))).toEqual([
        10,
      ]);
      expect(db.db.insert).not.toHaveBeenCalled();
    });

    it('turns a gained free Loner into the starting one and closes its unconfirmed slot', async () => {
      const db = mockDb(
        [{ id: 7 }],
        [loner({ source: 'chosen', advancementOrder: 2, isFreeExtra: true })],
      );
      const service = await makeService(db);

      await service.ensureStartingLoner(1);

      expect(db.chains[2].set).toHaveBeenCalledWith({
        source: 'starting',
        advancementOrder: null,
        orderConfirmed: false,
        isFreeExtra: false,
      });
      expect(slots.closeUnconfirmed).toHaveBeenCalledWith(expect.anything(), {
        playerId: 1,
        slots: [2],
      });
      expect(slots.close).toHaveBeenCalledWith(expect.anything(), {
        playerId: 1,
        slots: [],
      });
      expect(db.db.insert).not.toHaveBeenCalled();
    });

    it('leaves a gained Loner alone when an active starting Loner exists', async () => {
      const db = mockDb(
        [{ id: 7 }],
        [
          loner({}),
          loner({
            id: 11,
            source: 'chosen',
            advancementOrder: 1,
            isFreeExtra: true,
          }),
        ],
      );
      const service = await makeService(db);

      await service.ensureStartingLoner(1);

      expect(db.db.update).not.toHaveBeenCalled();
      expect(db.db.insert).not.toHaveBeenCalled();
      expect(slots.close).not.toHaveBeenCalled();
      expect(slots.closeUnconfirmed).not.toHaveBeenCalled();
    });

    it('converts only the lowest-id gained Loner', async () => {
      const db = mockDb(
        [{ id: 7 }],
        [
          loner({
            id: 12,
            source: 'chosen',
            advancementOrder: 3,
            isFreeExtra: true,
          }),
          loner({
            id: 11,
            source: 'chosen',
            advancementOrder: 1,
            isFreeExtra: true,
          }),
        ],
      );
      const service = await makeService(db);

      await service.ensureStartingLoner(1);

      expect(db.db.update).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(db.chains[2].where))).toEqual([
        11,
      ]);
      expect(slots.closeUnconfirmed).toHaveBeenCalledWith(expect.anything(), {
        playerId: 1,
        slots: [1],
      });
    });

    it('prefers converting a gained Loner over reviving a removed starting one', async () => {
      const db = mockDb(
        [{ id: 7 }],
        [
          loner({ removed: true }),
          loner({
            id: 11,
            source: 'chosen',
            attributeValue: '4+',
            advancementOrder: 1,
            isFreeExtra: true,
          }),
        ],
      );
      const service = await makeService(db);

      await service.ensureStartingLoner(1);

      expect(db.db.update).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(db.chains[2].where))).toEqual([
        11,
      ]);
    });

    it("closes a confirmed paid Loner's slot in the paid numbering", async () => {
      const db = mockDb(
        [{ id: 7 }],
        [
          loner({
            source: 'advancement',
            advancementOrder: 1,
            orderConfirmed: true,
          }),
        ],
      );
      const service = await makeService(db);

      await service.ensureStartingLoner(1);

      expect(slots.close).toHaveBeenCalledWith(expect.anything(), {
        playerId: 1,
        slots: [1],
      });
      expect(slots.closeUnconfirmed).toHaveBeenCalledWith(expect.anything(), {
        playerId: 1,
        slots: [],
      });
    });
  });

  describe('retireStartingLoner', () => {
    it("flags the player's active starting Loner removed in one statement", async () => {
      const db = mockDb();
      const service = await makeService(db);

      await service.retireStartingLoner(1);

      expect(db.chains).toHaveLength(1);
      expect(db.db.update).toHaveBeenCalledWith(playerAdvancements);
      expect(db.chains[0].set).toHaveBeenCalledWith({ removed: true });
      expect(extractAllFilterValues(firstCallArg(db.chains[0].where))).toEqual([
        1,
        'starting',
        false,
        'Loner',
      ]);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it("spares a starting Loner the player's position starts with", async () => {
      const db = mockDb();
      const service = await makeService(db);

      await service.retireStartingLoner(1);

      expect(sqlText(firstCallArg(db.chains[0].where))).toContain('not exists');
      expect(extractJoinColumns(firstCallArg(db.chains[0].where))).toEqual(
        expect.arrayContaining([
          'position_rules_set_skills.skill_id',
          'players.position_id',
          'position_rules_sets.position_id',
        ]),
      );
    });

    it('never closes a slot: a starting row holds no number', async () => {
      const db = mockDb();
      const service = await makeService(db);

      await service.retireStartingLoner(1);

      expect(slots.close).not.toHaveBeenCalled();
      expect(slots.closeUnconfirmed).not.toHaveBeenCalled();
    });
  });
});
