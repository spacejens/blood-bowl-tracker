import { DB, players } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import {
  extractAllFilterValues,
  firstCallArg,
  mockDb,
} from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { IncompletePlayerFillError } from '../shared/incomplete-player-fill-error';
import type {
  LastingReductionCounts,
  PlayerFillState,
} from './player-fill.types';
import { PlayerFillReductionsService } from './player-fill-reductions.service';
import { PlayerFillReductionsRecordService } from './player-fill-reductions-record.service';
import { PlayerFillStateService } from './player-fill-state.service';

const NO_REDUCTIONS: LastingReductionCounts = {
  moveReductionCount: 0,
  strengthReductionCount: 0,
  agilityReductionCount: 0,
  passingReductionCount: 0,
  armourReductionCount: 0,
};

const DERIVED: LastingReductionCounts = {
  ...NO_REDUCTIONS,
  armourReductionCount: 1,
};

interface Harness {
  service: PlayerFillReductionsRecordService;
  db: MockDbResult;
  reductions: MockProxy<PlayerFillReductionsService>;
}

async function makeService(
  loaded: PlayerFillState | undefined,
  updatedRows: unknown[] = [{ id: 9 }],
): Promise<Harness> {
  const db = mockDb(updatedRows);
  const state = mock<PlayerFillStateService>();
  state.load.mockResolvedValue(loaded);
  const reductions = mock<PlayerFillReductionsService>();
  reductions.derive.mockResolvedValue(DERIVED);
  const moduleRef = await Test.createTestingModule({
    providers: [
      PlayerFillReductionsRecordService,
      { provide: DB, useValue: db.db },
      { provide: PlayerFillStateService, useValue: state },
      { provide: PlayerFillReductionsService, useValue: reductions },
    ],
  }).compile();
  return {
    service: moduleRef.get(PlayerFillReductionsRecordService),
    db,
    reductions,
  };
}

function filled(overrides: Partial<PlayerFillState> = {}): PlayerFillState {
  return {
    playerId: 9,
    isStarPlayer: false,
    tpExternalId: { externalSystemId: 3, externalId: '586220' },
    incomplete: false,
    positionId: 30,
    eraId: 4,
    fields: {
      move: 6,
      strength: 3,
      agility: 3,
      passing: 4,
      armour: 8,
      sppTotal: 26,
      sppAdjustment: 0,
      unspentSpp: 0,
      status: 'retired',
    },
    reductions: NO_REDUCTIONS,
    rows: [
      {
        skillId: 70,
        characteristic: null,
        attributeValue: null,
        source: 'starting',
        isFreeExtra: false,
        advancementOrder: null,
        orderConfirmed: false,
      },
      {
        skillId: null,
        characteristic: 'AV',
        attributeValue: null,
        source: 'characteristic',
        isFreeExtra: false,
        advancementOrder: 1,
        orderConfirmed: true,
      },
    ],
    rulesSetIds: [2],
    ...overrides,
  };
}

describe('PlayerFillReductionsRecordService', () => {
  it.each<[string, PlayerFillState | undefined, string]>([
    ['does not exist', undefined, 'Player 9 does not exist'],
    [
      'is not a TP player',
      filled({ tpExternalId: undefined }),
      'Player 9 is not a TP player',
    ],
    [
      'is a star player',
      filled({ isStarPlayer: true }),
      'Player 9 is a star player',
    ],
    [
      'is still incomplete',
      filled({ incomplete: true }),
      'Player 9 is still incomplete: fill him in before recording his lasting reductions',
    ],
  ])(
    'refuses a player who %s, writing nothing',
    async (_name, loaded, message) => {
      const { service, db } = await makeService(loaded);

      await expect(service.record({ playerId: 9 })).rejects.toThrow(
        new IncompletePlayerFillError(message),
      );
      expect(db.db.update).not.toHaveBeenCalled();
    },
  );

  it('leaves a player with a reduction already stored unchanged', async () => {
    const { service, db, reductions } = await makeService(
      filled({ reductions: { ...NO_REDUCTIONS, moveReductionCount: 1 } }),
    );

    await expect(service.record({ playerId: 9 })).resolves.toEqual({
      playerId: 9,
      outcome: 'unchanged',
    });
    expect(reductions.derive).not.toHaveBeenCalled();
    expect(db.db.update).not.toHaveBeenCalled();
  });

  it('leaves a player whose stored data shows no reduction unchanged', async () => {
    const { service, db, reductions } = await makeService(filled());
    reductions.derive.mockResolvedValue(NO_REDUCTIONS);

    await expect(service.record({ playerId: 9 })).resolves.toEqual({
      playerId: 9,
      outcome: 'unchanged',
    });
    expect(db.db.update).not.toHaveBeenCalled();
  });

  it('records the counts derived from his stored line and increases', async () => {
    const { service, db, reductions } = await makeService(filled());

    await expect(service.record({ playerId: 9 })).resolves.toEqual({
      playerId: 9,
      outcome: 'recorded',
    });
    expect(reductions.derive).toHaveBeenCalledWith({
      positionId: 30,
      eraId: 4,
      line: { move: 6, strength: 3, agility: 3, passing: 4, armour: 8 },
      increases: ['AV'],
    });
    expect(db.db.update).toHaveBeenCalledWith(players);
    expect(db.chains[0].set).toHaveBeenCalledWith(DERIVED);
    expect(extractAllFilterValues(firstCallArg(db.chains[0].where))).toEqual([
      9, 0, 0, 0, 0, 0,
    ]);
  });

  it('answers unchanged when a concurrent write left no row to update', async () => {
    const { service } = await makeService(filled(), []);

    await expect(service.record({ playerId: 9 })).resolves.toEqual({
      playerId: 9,
      outcome: 'unchanged',
    });
  });
});
