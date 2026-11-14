import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import {
  extractJoinColumns,
  firstCallArg,
  mockDb,
} from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { PlayerFillStateService } from './player-fill-state.service';

async function makeService(
  ...rowsPerQuery: unknown[][]
): Promise<{ service: PlayerFillStateService; db: MockDbResult }> {
  const db = mockDb(...rowsPerQuery);
  const moduleRef = await Test.createTestingModule({
    providers: [PlayerFillStateService, { provide: DB, useValue: db.db }],
  }).compile();
  return { service: moduleRef.get(PlayerFillStateService), db };
}

const playerRow = {
  move: 0,
  strength: 0,
  agility: 0,
  passing: null,
  armour: 0,
  sppTotal: null,
  sppAdjustment: null,
  unspentSpp: null,
  status: null,
  isStarPlayer: false,
  eraId: 4,
};

const storedRow = {
  skillId: 70,
  characteristic: null,
  attributeValue: null,
  source: 'starting',
  isFreeExtra: false,
  advancementOrder: null,
  orderConfirmed: false,
};

describe('PlayerFillStateService', () => {
  it('is undefined for a player that does not exist, after one read', async () => {
    const { service, db } = await makeService([]);

    await expect(service.load(9)).resolves.toBeUndefined();
    expect(db.db.select).toHaveBeenCalledTimes(1);
  });

  it('reads the player, his TP id, whether he is incomplete, his era rules sets and his rows', async () => {
    const { service } = await makeService(
      [playerRow],
      [{ externalSystemId: 3, externalId: '586220' }],
      [{ id: 9 }],
      [{ rulesSetId: 2 }, { rulesSetId: 5 }],
      [storedRow],
    );

    await expect(service.load(9)).resolves.toEqual({
      playerId: 9,
      isStarPlayer: false,
      tpExternalId: { externalSystemId: 3, externalId: '586220' },
      incomplete: true,
      fields: {
        move: 0,
        strength: 0,
        agility: 0,
        passing: null,
        armour: 0,
        sppTotal: null,
        sppAdjustment: null,
        unspentSpp: null,
        status: null,
      },
      rows: [storedRow],
      rulesSetIds: [2, 5],
    });
  });

  it('reports a complete player without a TP id as such', async () => {
    const { service } = await makeService([playerRow], [], [], [], []);

    const state = await service.load(9);

    expect(state?.incomplete).toBe(false);
    expect(state?.tpExternalId).toBeUndefined();
  });

  it('asks whether he is incomplete through the shared criteria', async () => {
    const { service, db } = await makeService([playerRow]);

    await service.load(9);

    expect(extractJoinColumns(firstCallArg(db.chains[2].where))).toEqual([
      'players.id',
      'players.move',
      'players.strength',
      'players.agility',
      'players.armour',
      'players.spp_total',
      'players.spp_adjustment',
      'players.status',
    ]);
  });

  it('reads only the active advancement rows', async () => {
    const { service, db } = await makeService([playerRow]);

    await service.load(9);

    expect(extractJoinColumns(firstCallArg(db.chains[4].where))).toEqual([
      'player_advancements.player_id',
      'player_advancements.removed',
    ]);
  });
});
