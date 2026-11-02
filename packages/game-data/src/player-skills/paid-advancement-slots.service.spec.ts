import { playerAdvancements } from '@blood-bowl-tracker/db';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  extractAllFilterValues,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
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
});
