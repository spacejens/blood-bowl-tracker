import { DB, playerAdvancements } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import {
  extractAllFilterValues,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import { PlayerAdvancementReadsService } from './player-advancement-reads.service';

async function makeService(
  db: MockDbResult,
): Promise<PlayerAdvancementReadsService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      PlayerAdvancementReadsService,
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
});
