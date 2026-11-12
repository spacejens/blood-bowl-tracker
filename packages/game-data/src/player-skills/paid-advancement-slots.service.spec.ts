import { playerAdvancements } from '@blood-bowl-tracker/db';
import {
  extractAllFilterValues,
  firstCallArg,
  mockDb,
} from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { PaidAdvancementSlotsService } from './paid-advancement-slots.service';

describe('PaidAdvancementSlotsService', () => {
  let service: PaidAdvancementSlotsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [PaidAdvancementSlotsService],
    }).compile();
    service = moduleRef.get(PaidAdvancementSlotsService);
  });

  it('writes nothing when no slot closes', async () => {
    const db = mockDb();

    await service.close(db.db, { playerId: 1, slots: [] });

    expect(db.db.update).not.toHaveBeenCalled();
  });

  it("shifts the player's confirmed, non-removed paid rows after the slot", async () => {
    const db = mockDb();

    await service.close(db.db, { playerId: 1, slots: [2] });

    expect(db.db.update).toHaveBeenCalledWith(playerAdvancements);
    expect(db.chains[0].set).toHaveBeenCalledTimes(1);
    expect(extractAllFilterValues(firstCallArg(db.chains[0].where))).toEqual([
      1,
      true,
      false,
      false,
      2,
    ]);
  });

  it('closes several slots in one update bounded by the lowest', async () => {
    const db = mockDb();

    await service.close(db.db, { playerId: 1, slots: [4, 2] });

    expect(db.chains).toHaveLength(1);
    expect(extractAllFilterValues(firstCallArg(db.chains[0].where))).toEqual([
      1,
      true,
      false,
      false,
      2,
    ]);
  });
  describe('closeUnconfirmed', () => {
    it('writes nothing when no slot closes', async () => {
      const db = mockDb();

      await service.closeUnconfirmed(db.db, { playerId: 1, slots: [] });

      expect(db.db.update).not.toHaveBeenCalled();
    });

    it("shifts the player's unconfirmed, non-removed, non-starting rows after the slot", async () => {
      const db = mockDb();

      await service.closeUnconfirmed(db.db, { playerId: 1, slots: [3, 1] });

      expect(db.chains).toHaveLength(1);
      expect(db.db.update).toHaveBeenCalledWith(playerAdvancements);
      expect(extractAllFilterValues(firstCallArg(db.chains[0].where))).toEqual([
        1,
        false,
        false,
        'starting',
        1,
      ]);
    });
  });
});
