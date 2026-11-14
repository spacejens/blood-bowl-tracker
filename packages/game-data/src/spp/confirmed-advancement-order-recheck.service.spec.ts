import { DB, players } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type {
  SpendCheckRow,
  StoredWithFreeExtras,
} from './advancement-order-spend-check.service';
import { AdvancementOrderSpendCheckService } from './advancement-order-spend-check.service';
import { ConfirmedAdvancementOrderRecheckService } from './confirmed-advancement-order-recheck.service';

interface Harness {
  service: ConfirmedAdvancementOrderRecheckService;
  db: MockDbResult;
  spendCheck: MockProxy<AdvancementOrderSpendCheckService>;
}

async function makeService(db: MockDbResult = mockDb()): Promise<Harness> {
  const spendCheck = mock<AdvancementOrderSpendCheckService>();
  spendCheck.reportedSpend.mockReturnValue({ kind: 'spent', spent: 14 });
  spendCheck.storedWithFreeExtras.mockResolvedValue(new Map());
  spendCheck.spendProblems.mockResolvedValue(new Map());
  const moduleRef = await Test.createTestingModule({
    providers: [
      ConfirmedAdvancementOrderRecheckService,
      { provide: DB, useValue: db.db },
      { provide: AdvancementOrderSpendCheckService, useValue: spendCheck },
    ],
  }).compile();
  return {
    service: moduleRef.get(ConfirmedAdvancementOrderRecheckService),
    db,
    spendCheck,
  };
}

const figures = (id: number, name = `Player ${id}`) => ({
  id,
  name,
  sppTotal: 20,
  unspentSpp: 6,
});

const row = (
  id: number,
  overrides: Partial<SpendCheckRow> = {},
): SpendCheckRow => ({
  id,
  playerId: 1,
  skillId: id,
  characteristic: null,
  attributeValue: null,
  source: 'chosen',
  isFreeExtra: false,
  removed: false,
  advancementOrder: null,
  orderConfirmed: true,
  ...overrides,
});

const stored = (
  rows: SpendCheckRow[],
  freeRowIds: number[] = [],
): StoredWithFreeExtras => ({
  stored: rows,
  freeRowIds: new Set(freeRowIds),
  flagEntries: [],
});

/** A complete confirmed order for player 1: row 12 first, then row 11. */
const confirmed = new Map([
  [
    1,
    stored([
      row(11, { advancementOrder: 2 }),
      row(12, { advancementOrder: 1, source: 'random' }),
    ]),
  ],
]);

describe('ConfirmedAdvancementOrderRecheckService', () => {
  it('reads nothing for no players', async () => {
    const { service, db } = await makeService();

    expect(await service.recheck([])).toEqual([]);
    expect(db.chains).toHaveLength(0);
  });

  it('skips a player whose SPP figures are not both stored, reading no rows', async () => {
    const { service, db, spendCheck } = await makeService(
      mockDb([{ ...figures(1), unspentSpp: null }]),
    );
    spendCheck.reportedSpend.mockReturnValue({ kind: 'unknown' });

    expect(await service.recheck([1])).toEqual([]);
    expect(db.chains[0].from).toHaveBeenCalledWith(players);
    expect(spendCheck.reportedSpend).toHaveBeenCalledWith(
      expect.objectContaining({ sppTotal: 20, unspentSpp: null }),
    );
    expect(spendCheck.storedWithFreeExtras).not.toHaveBeenCalled();
  });

  it.each([
    ['no stored rows', new Map<number, StoredWithFreeExtras>()],
    [
      'only starting, free and removed rows',
      new Map([
        [
          1,
          stored([
            row(11, { source: 'starting' }),
            row(12, { isFreeExtra: true }),
            row(13, { removed: true, advancementOrder: 1 }),
          ]),
        ],
      ]),
    ],
    [
      'an unconfirmed paid row',
      new Map([
        [
          1,
          stored([
            row(11, { advancementOrder: 1 }),
            row(12, { advancementOrder: 2, orderConfirmed: false }),
          ]),
        ],
      ]),
    ],
    [
      'a confirmed paid row with no number',
      new Map([[1, stored([row(11, { advancementOrder: null })])]]),
    ],
  ])('skips a player with %s', async (_unused, byPlayer) => {
    const { service, spendCheck } = await makeService(mockDb([figures(1)]));
    spendCheck.storedWithFreeExtras.mockResolvedValue(byPlayer);

    expect(await service.recheck([1])).toEqual([]);
    expect(spendCheck.spendProblems).toHaveBeenCalledWith([]);
  });

  it('prices the paid rows in their stored order, characteristic increases included and free extras left out', async () => {
    const { service, spendCheck } = await makeService(mockDb([figures(1)]));
    spendCheck.storedWithFreeExtras.mockResolvedValue(
      new Map([
        [
          1,
          stored(
            [
              row(11, { advancementOrder: 3 }),
              row(12, {
                skillId: null,
                characteristic: 'AG',
                source: 'characteristic',
                advancementOrder: 1,
              }),
              // Returned by the spend check already counted free.
              row(13, {
                isFreeExtra: true,
                advancementOrder: 2,
                orderConfirmed: false,
              }),
              row(14, { advancementOrder: 2, source: 'random' }),
            ],
            [13],
          ),
        ],
      ]),
    );

    expect(await service.recheck([1])).toEqual([]);
    expect(spendCheck.storedWithFreeExtras).toHaveBeenCalledWith([1]);
    expect(spendCheck.spendProblems).toHaveBeenCalledWith([
      {
        playerId: 1,
        rowIdsInOrder: [12, 14, 11],
        freeRowIds: new Set([13]),
        spent: 14,
      },
    ]);
  });

  it.each([
    [
      ": this order cannot cost exactly the 14 SPP reported as spent under any rules set of the player's era",
      "this order cannot cost exactly the 14 SPP reported as spent under any rules set of the player's era",
    ],
    [
      ' has 7 paid advancements; at most 6 can be checked',
      'has 7 paid advancements; at most 6 can be checked',
    ],
    [
      ' has no rules set that prices advancements, so the order cannot be checked against the SPP reported as spent',
      'has no rules set that prices advancements, so the order cannot be checked against the SPP reported as spent',
    ],
  ])(
    'reports the spend check problem %j as a standalone sentence',
    async (raw, standalone) => {
      const { service, spendCheck } = await makeService(
        mockDb([figures(1, 'Griff Oberwald')]),
      );
      spendCheck.storedWithFreeExtras.mockResolvedValue(confirmed);
      spendCheck.spendProblems.mockResolvedValue(new Map([[1, raw]]));

      expect(await service.recheck([1])).toEqual([
        { playerId: 1, name: 'Griff Oberwald', problem: standalone },
      ]);
    },
  );

  it('reports inconsistent figures for a player with a complete order, without pricing him', async () => {
    const { service, spendCheck } = await makeService(mockDb([figures(1)]));
    spendCheck.reportedSpend.mockReturnValue({
      kind: 'inconsistent',
      problem:
        ' has an unspent SPP figure outside 0 to the SPP total, so the order cannot be checked against it',
    });
    spendCheck.storedWithFreeExtras.mockResolvedValue(confirmed);

    expect(await service.recheck([1])).toEqual([
      {
        playerId: 1,
        name: 'Player 1',
        problem:
          'has an unspent SPP figure outside 0 to the SPP total, so the order cannot be checked against it',
      },
    ]);
    expect(spendCheck.spendProblems).toHaveBeenCalledWith([]);
  });

  it('skips inconsistent figures when the order is not complete', async () => {
    const { service, spendCheck } = await makeService(mockDb([figures(1)]));
    spendCheck.reportedSpend.mockReturnValue({
      kind: 'inconsistent',
      problem: ' x',
    });

    expect(await service.recheck([1])).toEqual([]);
  });

  it('rechecks several players in one batch and lists the problems by player id', async () => {
    const { service, spendCheck } = await makeService(
      mockDb([figures(3), figures(1), figures(2)]),
    );
    spendCheck.storedWithFreeExtras.mockResolvedValue(
      new Map([
        [1, stored([row(11, { advancementOrder: 1 })])],
        [2, stored([row(21, { playerId: 2, advancementOrder: 1 })])],
        [3, stored([row(31, { playerId: 3, advancementOrder: 1 })])],
      ]),
    );
    spendCheck.spendProblems.mockResolvedValue(
      new Map([
        [3, ': this order cannot cost exactly the 14 SPP'],
        [1, ': this order cannot cost exactly the 14 SPP'],
      ]),
    );

    const problems = await service.recheck([3, 1, 2]);

    expect(spendCheck.storedWithFreeExtras).toHaveBeenCalledWith([3, 1, 2]);
    expect(spendCheck.spendProblems).toHaveBeenCalledTimes(1);
    expect(problems.map((problem) => problem.playerId)).toEqual([1, 3]);
  });
});
