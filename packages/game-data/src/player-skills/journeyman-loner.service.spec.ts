import {
  DB,
  playerAdvancements,
  players,
  skills,
} from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import {
  DrizzleQueryError,
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

/**
 * A unique violation on player_advancements as drizzle throws it: a
 * `DrizzleQueryError` wrapping the driver error that carries the fields.
 */
function uniqueViolation(): Error {
  const pgError = Object.assign(
    new Error('duplicate key value violates unique constraint'),
    {
      code: '23505',
      table_name: 'player_advancements',
      constraint_name: 'player_advancements_skill_without_attribute_unique',
    },
  );
  return new DrizzleQueryError(
    'insert into "player_advancements" ...',
    [],
    pgError,
  );
}

/** The locked player row's stored marker, the first in-transaction read. */
const STORED_JOURNEYMAN = [{ isJourneyman: true }];
const STORED_NOT_JOURNEYMAN = [{ isJourneyman: false }];

/** Retire's unlocked pre-read finding an active starting Loner. */
const ACTIVE_LONER = [{ id: 10 }];

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

  // Query order for ensure: chain 0 = the Loner skill lookup, then inside
  // the transaction chain 1 = the locked player row, chain 2 = the player's
  // Loner rows (chain 3 their Loner subquery), then writes. For retire:
  // chain 0 = the unlocked active-Loner pre-read (chain 1 its subquery),
  // then chain 2 = the locked player row, then the update and its subquery.
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

    it("locks the player's row and reads his stored marker first", async () => {
      const db = mockDb([{ id: 7 }], STORED_JOURNEYMAN, [loner({})]);
      const service = await makeService(db);

      await service.ensureStartingLoner(1);

      expect(db.transaction).toHaveBeenCalledTimes(1);
      expect(db.chains[1].from).toHaveBeenCalledWith(players);
      expect(db.chains[1].for).toHaveBeenCalledWith('no key update');
      expect(extractAllFilterValues(firstCallArg(db.chains[1].where))).toEqual([
        1,
      ]);
    });

    it('does nothing once the stored marker is cleared', async () => {
      const db = mockDb([{ id: 7 }], STORED_NOT_JOURNEYMAN);
      const service = await makeService(db);

      await service.ensureStartingLoner(1);

      expect(db.chains).toHaveLength(2);
      expect(db.db.insert).not.toHaveBeenCalled();
      expect(db.db.update).not.toHaveBeenCalled();
    });

    it('does nothing when the player row is gone', async () => {
      const db = mockDb([{ id: 7 }], []);
      const service = await makeService(db);

      await service.ensureStartingLoner(1);

      expect(db.chains).toHaveLength(2);
      expect(db.db.insert).not.toHaveBeenCalled();
    });

    it('inserts a starting Loner when the player has none', async () => {
      const db = mockDb([{ id: 7 }], STORED_JOURNEYMAN, []);
      const service = await makeService(db);

      await service.ensureStartingLoner(1);

      expect(db.db.insert).toHaveBeenCalledWith(playerAdvancements);
      expect(db.chains[4].values).toHaveBeenCalledWith({
        playerId: 1,
        skillId: 7,
        source: 'starting',
      });
      expect(db.db.update).not.toHaveBeenCalled();
    });

    it('inserts with the lowest-id skill named Loner', async () => {
      const db = mockDb([{ id: 7 }], STORED_JOURNEYMAN, []);
      const service = await makeService(db);

      await service.ensureStartingLoner(1);

      const order = firstCallArg(db.chains[0].orderBy);
      expect(extractJoinColumns(order)).toEqual(['skills.id']);
      expect(sqlText(order)).toContain(' asc');
      expect(db.chains[0].limit).toHaveBeenCalledWith(1);
      expect(db.chains[4].values).toHaveBeenCalledWith({
        playerId: 1,
        skillId: 7,
        source: 'starting',
      });
    });

    it('treats a concurrent insert of the same starting Loner as done', async () => {
      // Chain 5 re-reads the active starting Loner the other write inserted.
      const db = mockDb(
        [{ id: 7 }],
        STORED_JOURNEYMAN,
        [],
        [],
        uniqueViolation(),
        [{ id: 20 }],
      );
      const service = await makeService(db);

      await expect(service.ensureStartingLoner(1)).resolves.toBeUndefined();
      expect(extractAllFilterValues(firstCallArg(db.chains[5].where))).toEqual([
        1,
        'starting',
        false,
      ]);
    });

    it('rethrows a unique violation that left no active starting Loner', async () => {
      const violation = uniqueViolation();
      const db = mockDb([{ id: 7 }], STORED_JOURNEYMAN, [], [], violation, []);
      const service = await makeService(db);

      await expect(service.ensureStartingLoner(1)).rejects.toBe(violation);
    });

    it('propagates any other failure', async () => {
      const db = mockDb(
        [{ id: 7 }],
        STORED_JOURNEYMAN,
        [],
        [],
        new Error('boom'),
      );
      const service = await makeService(db);

      await expect(service.ensureStartingLoner(1)).rejects.toThrow('boom');
    });

    it("reads the player's rows of every skill named Loner", async () => {
      const db = mockDb([{ id: 7 }], STORED_JOURNEYMAN, [loner({})]);
      const service = await makeService(db);

      await service.ensureStartingLoner(1);

      // Chain 3 is the subquery naming every skill called Loner.
      expect(db.chains[3].from).toHaveBeenCalledWith(skills);
      expect(extractAllFilterValues(firstCallArg(db.chains[3].where))).toEqual([
        'Loner',
      ]);
    });

    it('writes nothing when an active starting Loner exists', async () => {
      const db = mockDb([{ id: 7 }], STORED_JOURNEYMAN, [loner({})]);
      const service = await makeService(db);

      await service.ensureStartingLoner(1);

      expect(db.db.update).not.toHaveBeenCalled();
      expect(db.db.insert).not.toHaveBeenCalled();
    });

    it('revives a removed starting Loner', async () => {
      const db = mockDb([{ id: 7 }], STORED_JOURNEYMAN, [
        loner({ removed: true }),
      ]);
      const service = await makeService(db);

      await service.ensureStartingLoner(1);

      expect(db.db.update).toHaveBeenCalledTimes(1);
      expect(db.chains[4].set).toHaveBeenCalledWith({ removed: false });
      expect(extractAllFilterValues(firstCallArg(db.chains[4].where))).toEqual([
        10,
      ]);
      expect(db.db.insert).not.toHaveBeenCalled();
    });

    it('turns a gained free Loner into the starting one and closes its unconfirmed slot', async () => {
      const db = mockDb([{ id: 7 }], STORED_JOURNEYMAN, [
        loner({ source: 'chosen', advancementOrder: 2, isFreeExtra: true }),
      ]);
      const service = await makeService(db);

      await service.ensureStartingLoner(1);

      expect(db.chains[4].set).toHaveBeenCalledWith({
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
      const db = mockDb([{ id: 7 }], STORED_JOURNEYMAN, [
        loner({}),
        loner({
          id: 11,
          source: 'chosen',
          advancementOrder: 1,
          isFreeExtra: true,
        }),
      ]);
      const service = await makeService(db);

      await service.ensureStartingLoner(1);

      expect(db.db.update).not.toHaveBeenCalled();
      expect(db.db.insert).not.toHaveBeenCalled();
      expect(slots.close).not.toHaveBeenCalled();
      expect(slots.closeUnconfirmed).not.toHaveBeenCalled();
    });

    it('converts only the lowest-id gained Loner', async () => {
      const db = mockDb([{ id: 7 }], STORED_JOURNEYMAN, [
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
      ]);
      const service = await makeService(db);

      await service.ensureStartingLoner(1);

      expect(db.db.update).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(db.chains[4].where))).toEqual([
        11,
      ]);
      expect(slots.closeUnconfirmed).toHaveBeenCalledWith(expect.anything(), {
        playerId: 1,
        slots: [1],
      });
    });

    it('prefers converting a gained Loner over reviving a removed starting one', async () => {
      const db = mockDb([{ id: 7 }], STORED_JOURNEYMAN, [
        loner({ removed: true }),
        loner({
          id: 11,
          source: 'chosen',
          attributeValue: '4+',
          advancementOrder: 1,
          isFreeExtra: true,
        }),
      ]);
      const service = await makeService(db);

      await service.ensureStartingLoner(1);

      expect(db.db.update).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(db.chains[4].where))).toEqual([
        11,
      ]);
    });

    it("closes a confirmed paid Loner's slot in the paid numbering", async () => {
      const db = mockDb([{ id: 7 }], STORED_JOURNEYMAN, [
        loner({
          source: 'advancement',
          advancementOrder: 1,
          orderConfirmed: true,
        }),
      ]);
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
    it('opens no transaction when the player has no active starting Loner', async () => {
      const db = mockDb([]);
      const service = await makeService(db);

      await service.retireStartingLoner(1);

      expect(db.transaction).not.toHaveBeenCalled();
      expect(db.db.update).not.toHaveBeenCalled();
      // The unlocked pre-read and its Loner subquery only.
      expect(db.chains).toHaveLength(2);
      expect(extractAllFilterValues(firstCallArg(db.chains[0].where))).toEqual([
        1,
        'starting',
        false,
      ]);
      expect(db.chains[0].for).not.toHaveBeenCalled();
    });

    it('takes the locked path when an active starting Loner exists', async () => {
      const db = mockDb(ACTIVE_LONER, [], STORED_NOT_JOURNEYMAN);
      const service = await makeService(db);

      await service.retireStartingLoner(1);

      expect(db.transaction).toHaveBeenCalledTimes(1);
      expect(db.chains[2].from).toHaveBeenCalledWith(players);
      expect(db.db.update).toHaveBeenCalledWith(playerAdvancements);
    });

    it("flags the player's active starting Loner removed in one statement", async () => {
      const db = mockDb(ACTIVE_LONER, [], STORED_NOT_JOURNEYMAN);
      const service = await makeService(db);

      await service.retireStartingLoner(1);

      // The unlocked pre-read and its Loner subquery, the player lock, the
      // update, and the update's Loner subquery.
      expect(db.chains).toHaveLength(5);
      expect(db.db.update).toHaveBeenCalledWith(playerAdvancements);
      expect(db.chains[3].set).toHaveBeenCalledWith({ removed: true });
      expect(extractAllFilterValues(firstCallArg(db.chains[3].where))).toEqual([
        1,
        'starting',
        false,
        true,
      ]);
      expect(db.transaction).toHaveBeenCalledTimes(1);
    });

    it("locks the player's row and reads his stored marker first", async () => {
      const db = mockDb(ACTIVE_LONER, [], STORED_NOT_JOURNEYMAN);
      const service = await makeService(db);

      await service.retireStartingLoner(1);

      expect(db.chains[2].from).toHaveBeenCalledWith(players);
      expect(db.chains[2].for).toHaveBeenCalledWith('no key update');
      expect(extractAllFilterValues(firstCallArg(db.chains[2].where))).toEqual([
        1,
      ]);
    });

    it('does nothing while the stored marker is set', async () => {
      const db = mockDb(ACTIVE_LONER, [], STORED_JOURNEYMAN);
      const service = await makeService(db);

      await service.retireStartingLoner(1);

      expect(db.chains).toHaveLength(3);
      expect(db.db.update).not.toHaveBeenCalled();
    });

    it('does nothing when the player row is gone', async () => {
      const db = mockDb(ACTIVE_LONER, [], []);
      const service = await makeService(db);

      await service.retireStartingLoner(1);

      expect(db.db.update).not.toHaveBeenCalled();
    });

    it("spares a starting Loner the player's position starts with", async () => {
      const db = mockDb(ACTIVE_LONER, [], STORED_NOT_JOURNEYMAN);
      const service = await makeService(db);

      await service.retireStartingLoner(1);

      expect(sqlText(firstCallArg(db.chains[3].where))).toContain('not exists');
      expect(extractJoinColumns(firstCallArg(db.chains[3].where))).toEqual(
        expect.arrayContaining([
          'position_rules_set_skills.skill_id',
          'players.position_id',
          'position_rules_sets.position_id',
        ]),
      );
    });

    it('spares the starting Loner of a star-player position', async () => {
      const db = mockDb(ACTIVE_LONER, [], STORED_NOT_JOURNEYMAN);
      const service = await makeService(db);

      await service.retireStartingLoner(1);

      const where = firstCallArg(db.chains[3].where);
      expect(extractJoinColumns(where)).toEqual(
        expect.arrayContaining(['positions.is_star_player', 'positions.id']),
      );
      expect(extractAllFilterValues(where)).toEqual([
        1,
        'starting',
        false,
        true,
      ]);
    });

    it('matches every skill named Loner', async () => {
      const db = mockDb(ACTIVE_LONER, [], STORED_NOT_JOURNEYMAN);
      const service = await makeService(db);

      await service.retireStartingLoner(1);

      expect(db.chains[4].from).toHaveBeenCalledWith(skills);
      expect(extractAllFilterValues(firstCallArg(db.chains[4].where))).toEqual([
        'Loner',
      ]);
    });

    it('never closes a slot: a starting row holds no number', async () => {
      const db = mockDb(ACTIVE_LONER, [], STORED_NOT_JOURNEYMAN);
      const service = await makeService(db);

      await service.retireStartingLoner(1);

      expect(slots.close).not.toHaveBeenCalled();
      expect(slots.closeUnconfirmed).not.toHaveBeenCalled();
    });
  });
});
