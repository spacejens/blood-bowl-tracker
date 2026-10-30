import { DB, players } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import {
  extractAllFilterValues,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import { UnspentSppService } from './unspent-spp.service';
import type {
  KnownUnspentSpp,
  ModelledUnspentSpp,
  PricingModel,
} from './unspent-spp.types';
import { UnspentSppDecisionService } from './unspent-spp-decision.service';

function known(unspentMin: number, unspentMax: number): KnownUnspentSpp {
  return {
    status: 'known',
    totalSpp: 30,
    advancementsGained: 2,
    spentMin: 30 - unspentMax,
    spentMax: 30 - unspentMin,
    unspentMin,
    unspentMax,
    cheapestNextCost: 6,
    coversAnother: 'maybe',
    storedVerdict: 'none_stored',
  };
}

function modelled(
  pricingModel: PricingModel | null,
  result: ModelledUnspentSpp['result'],
): ModelledUnspentSpp {
  return { pricingModel, result };
}

async function makeService(
  entries: [number, ModelledUnspentSpp][],
  db: MockDbResult = mockDb(),
): Promise<{
  service: UnspentSppDecisionService;
  unspent: MockProxy<UnspentSppService>;
  db: MockDbResult;
}> {
  const unspent = mock<UnspentSppService>();
  unspent.modelledForPlayers.mockResolvedValue(new Map(entries));
  const moduleRef = await Test.createTestingModule({
    providers: [
      UnspentSppDecisionService,
      { provide: DB, useValue: db.db },
      { provide: UnspentSppService, useValue: unspent },
    ],
  }).compile();
  return { service: moduleRef.get(UnspentSppDecisionService), unspent, db };
}

const SNAPSHOT = { unspentSpp: 9, snapshotSppTotal: 30 };

describe('UnspentSppDecisionService.decide', () => {
  it('asks nothing for no candidates', async () => {
    const { service, unspent } = await makeService([]);
    expect(await service.decide([])).toEqual(new Map());
    expect(unspent.modelledForPlayers).not.toHaveBeenCalled();
  });

  it('models the batch against the totals about to be written', async () => {
    const { service, unspent } = await makeService([]);
    await service.decide([
      { playerId: 1, sppTotal: 30, snapshot: null },
      { playerId: 2, sppTotal: 12, snapshot: null },
    ]);
    expect(unspent.modelledForPlayers).toHaveBeenCalledWith(
      [1, 2],
      new Map([
        [1, 30],
        [2, 12],
      ]),
    );
  });

  it.each([
    ['an exact figure', known(4, 4), 4],
    ['nothing for a range', known(4, 6), null],
    ['nothing for a negative exact figure', known(-2, -2), null],
    [
      'nothing for an unknown result',
      { status: 'unknown', reason: 'inconsistent_history' } as const,
      null,
    ],
  ] as const)(
    'stores %s under fixed thresholds, ignoring the source',
    async (_what, result, expected) => {
      const { service } = await makeService([
        [1, modelled('fixed_threshold', result)],
      ]);
      expect(
        await service.decide([
          { playerId: 1, sppTotal: 30, snapshot: SNAPSHOT },
        ]),
      ).toEqual(new Map([[1, expected]]));
    },
  );

  it.each([
    ['a figure outside the modelled range', SNAPSHOT, 30, 9],
    ['a zero figure', { unspentSpp: 0, snapshotSppTotal: 30 }, 30, 0],
    [
      'a figure equal to its total',
      { unspentSpp: 30, snapshotSppTotal: 30 },
      30,
      30,
    ],
    [
      'nothing for a negative figure',
      { unspentSpp: -1, snapshotSppTotal: 30 },
      30,
      null,
    ],
    [
      'nothing for a figure over its total',
      { unspentSpp: 31, snapshotSppTotal: 30 },
      30,
      null,
    ],
    ['nothing for a figure from another total', SNAPSHOT, 28, null],
    ['nothing without a figure', null, 30, null],
  ] as const)(
    'stores %s under kind pricing',
    async (...[, snapshot, sppTotal, expected]) => {
      const { service } = await makeService([
        [1, modelled('kind_priced', known(20, 25))],
      ]);
      expect(
        await service.decide([{ playerId: 1, sppTotal, snapshot }]),
      ).toEqual(new Map([[1, expected]]));
    },
  );

  it('stores nothing without a pricing model or a player row', async () => {
    const { service } = await makeService([[1, modelled(null, known(9, 9))]]);
    expect(
      await service.decide([
        { playerId: 1, sppTotal: 30, snapshot: SNAPSHOT },
        { playerId: 2, sppTotal: 30, snapshot: SNAPSHOT },
      ]),
    ).toEqual(
      new Map([
        [1, null],
        [2, null],
      ]),
    );
  });
});

describe('UnspentSppDecisionService.refreshFixedThreshold', () => {
  it('does nothing for no players', async () => {
    const { service, unspent, db } = await makeService([]);
    await service.refreshFixedThreshold([]);
    expect(unspent.modelledForPlayers).not.toHaveBeenCalled();
    expect(db.chains).toHaveLength(0);
  });

  it('rewrites fixed-threshold players from their stored totals, grouped by value', async () => {
    const { service, unspent, db } = await makeService([
      [1, modelled('fixed_threshold', known(4, 4))],
      [2, modelled('fixed_threshold', known(4, 6))],
      [3, modelled('fixed_threshold', known(4, 4))],
      [4, modelled('kind_priced', known(9, 9))],
      [5, modelled(null, known(9, 9))],
    ]);

    await service.refreshFixedThreshold([1, 2, 3, 4, 5]);

    expect(unspent.modelledForPlayers).toHaveBeenCalledWith([1, 2, 3, 4, 5]);
    expect(db.chains).toHaveLength(2);
    expect(db.db.update).toHaveBeenCalledWith(players);
    expect(firstCallArg(db.chains[0].set)).toEqual({ unspentSpp: 4 });
    expect(extractAllFilterValues(firstCallArg(db.chains[0].where))).toEqual([
      1, 3,
    ]);
    expect(firstCallArg(db.chains[1].set)).toEqual({ unspentSpp: null });
    expect(extractAllFilterValues(firstCallArg(db.chains[1].where))).toEqual([
      2,
    ]);
  });
});
