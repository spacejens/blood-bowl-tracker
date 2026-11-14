import type { PlayerSkillEntry } from '@blood-bowl-tracker/api-contract';
import { DB, playerAdvancements } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { PlayerAdvancementReadsService } from '../player-skills/player-advancement-reads.service';
import { AdvancementOrderDeductionService } from './advancement-order-deduction.service';
import type { SpendCheckRow } from './advancement-order-spend-check.service';
import { AdvancementOrderSpendCheckService } from './advancement-order-spend-check.service';
import { UnspentSppService } from './unspent-spp.service';
import type { RulesSetAdvancementInput } from './unspent-spp.types';

interface Harness {
  service: AdvancementOrderSpendCheckService;
  db: MockDbResult;
  reads: MockProxy<PlayerAdvancementReadsService>;
  unspentSpp: MockProxy<UnspentSppService>;
  deduction: MockProxy<AdvancementOrderDeductionService>;
}

async function makeService(db: MockDbResult = mockDb()): Promise<Harness> {
  const reads = mock<PlayerAdvancementReadsService>();
  reads.resolveFreeExtras.mockImplementation((entries) =>
    Promise.resolve(entries),
  );
  const unspentSpp = mock<UnspentSppService>();
  const deduction = mock<AdvancementOrderDeductionService>();
  const moduleRef = await Test.createTestingModule({
    providers: [
      AdvancementOrderSpendCheckService,
      { provide: DB, useValue: db.db },
      { provide: PlayerAdvancementReadsService, useValue: reads },
      { provide: UnspentSppService, useValue: unspentSpp },
      { provide: AdvancementOrderDeductionService, useValue: deduction },
    ],
  }).compile();
  return {
    service: moduleRef.get(AdvancementOrderSpendCheckService),
    db,
    reads,
    unspentSpp,
    deduction,
  };
}

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
  orderConfirmed: false,
  ...overrides,
});

const candidate = (id: number, isFreeExtra: boolean) => ({
  id,
  skillId: id,
  source: 'advancement' as const,
  isFreeExtra,
  advancementOrder: null,
  orderConfirmed: false,
});
const rulesSetWith = (lonerIsFree: boolean): RulesSetAdvancementInput => ({
  rulesSetId: 1,
  pricingModel: 'kind_priced',
  costs: [],
  candidatesInput: {
    skills: [candidate(11, false), candidate(13, lonerIsFree)],
    skillCategories: new Map(),
    positionAccess: new Map(),
    costs: [],
  },
});

describe('AdvancementOrderSpendCheckService.reportedSpend', () => {
  it.each([
    ['total', { sppTotal: null, unspentSpp: 6 }],
    ['unspent', { sppTotal: 20, unspentSpp: null }],
  ])('is unknown when the %s SPP is not stored', async (_unused, figures) => {
    const { service } = await makeService();

    expect(service.reportedSpend(figures)).toEqual({ kind: 'unknown' });
  });

  it.each([
    ['unspent is negative', { sppTotal: 20, unspentSpp: -1 }],
    ['unspent exceeds the total', { sppTotal: 20, unspentSpp: 21 }],
  ])('is inconsistent when %s', async (_unused, figures) => {
    const { service } = await makeService();

    expect(service.reportedSpend(figures)).toEqual({
      kind: 'inconsistent',
      problem:
        ' has an unspent SPP figure outside 0 to the SPP total, so the order cannot be checked against it',
    });
  });

  it('is the total minus the unspent SPP', async () => {
    const { service } = await makeService();

    expect(service.reportedSpend({ sppTotal: 20, unspentSpp: 6 })).toEqual({
      kind: 'spent',
      spent: 14,
    });
  });
});

describe('AdvancementOrderSpendCheckService.storedWithFreeExtras', () => {
  it('reads nothing for no players', async () => {
    const { service, db, reads } = await makeService();

    expect(await service.storedWithFreeExtras([])).toEqual(new Map());
    expect(db.chains).toHaveLength(0);
    expect(reads.resolveFreeExtras).not.toHaveBeenCalled();
  });

  it('groups the rows by player and leaves out players with none', async () => {
    const rows = [row(11), row(12, { playerId: 2 }), row(13)];
    const { service, db } = await makeService(mockDb(rows));

    const result = await service.storedWithFreeExtras([1, 2, 3]);

    expect(db.chains[0].from).toHaveBeenCalledWith(playerAdvancements);
    expect(result).toEqual(
      new Map([
        [
          1,
          {
            stored: [rows[0], rows[2]],
            freeRowIds: new Set(),
            flagEntries: [],
          },
        ],
        [2, { stored: [rows[1]], freeRowIds: new Set(), flagEntries: [] }],
      ]),
    );
  });

  it('counts a gained skill the free-extra rules make free as free, with an entry that flags it', async () => {
    const loner = row(13, {
      skillId: 10,
      source: 'advancement',
      attributeValue: '2+',
    });
    const rows = [
      row(11),
      loner,
      row(14, { skillId: 11, source: 'starting' }),
      row(15, { skillId: 12, removed: true }),
      row(16, { skillId: 13, isFreeExtra: true }),
      row(17, {
        skillId: null,
        characteristic: 'AG',
        source: 'characteristic',
      }),
    ];
    const { service, reads } = await makeService(mockDb(rows));
    const flag: PlayerSkillEntry = {
      playerId: 1,
      skillId: 10,
      source: 'advancement',
      attributeValue: '2+',
      isFreeExtra: true,
    };
    reads.resolveFreeExtras.mockResolvedValueOnce([
      { playerId: 1, skillId: 11, source: 'chosen', attributeValue: null },
      flag,
    ]);

    const result = await service.storedWithFreeExtras([1]);

    // Only gained, active, unflagged skill rows are offered to the rules.
    expect(reads.resolveFreeExtras).toHaveBeenCalledWith([
      { playerId: 1, skillId: 11, source: 'chosen', attributeValue: null },
      { playerId: 1, skillId: 10, source: 'advancement', attributeValue: '2+' },
    ]);
    expect(result.get(1)).toEqual({
      stored: [
        rows[0],
        { ...loner, isFreeExtra: true },
        rows[2],
        rows[3],
        rows[4],
        rows[5],
      ],
      freeRowIds: new Set([13, 16]),
      flagEntries: [flag],
    });
  });
});

describe('AdvancementOrderSpendCheckService.spendProblems', () => {
  const order = {
    playerId: 1,
    rowIdsInOrder: [11, 12],
    freeRowIds: new Set<number>(),
    spent: 14,
  };

  it('asks for nothing when given no orders', async () => {
    const { service, unspentSpp } = await makeService();

    expect(await service.spendProblems([])).toEqual(new Map());
    expect(unspentSpp.advancementInputsForPlayers).not.toHaveBeenCalled();
  });

  it('prices the order as the only allowed one and finds no problem when it fits', async () => {
    const { service, unspentSpp, deduction } = await makeService();
    unspentSpp.advancementInputsForPlayers.mockResolvedValue(
      new Map([[1, [rulesSetWith(false)]]]),
    );
    deduction.deduce.mockReturnValue(
      new Map([
        [11, 1],
        [12, 2],
      ]),
    );

    expect(await service.spendProblems([order])).toEqual(new Map());
    expect(unspentSpp.advancementInputsForPlayers).toHaveBeenCalledWith([1]);
    expect(deduction.deduce).toHaveBeenCalledWith({
      rulesSets: [rulesSetWith(false)],
      newRowIds: [11, 12],
      orderedRowIds: [11, 12],
      firstNumber: 1,
      spent: 14,
    });
  });

  it('prices the free rows as free', async () => {
    const { service, unspentSpp, deduction } = await makeService();
    unspentSpp.advancementInputsForPlayers.mockResolvedValue(
      new Map([[1, [rulesSetWith(false)]]]),
    );
    deduction.deduce.mockReturnValue(
      new Map([
        [11, 1],
        [12, 2],
      ]),
    );

    await service.spendProblems([{ ...order, freeRowIds: new Set([13]) }]);

    expect(deduction.deduce).toHaveBeenCalledWith(
      expect.objectContaining({ rulesSets: [rulesSetWith(true)] }),
    );
  });

  it('reports an order the spend does not allow', async () => {
    const { service, unspentSpp, deduction } = await makeService();
    unspentSpp.advancementInputsForPlayers.mockResolvedValue(
      new Map([[1, [rulesSetWith(false)]]]),
    );
    deduction.deduce.mockReturnValue(undefined);

    expect(await service.spendProblems([order])).toEqual(
      new Map([
        [
          1,
          ": this order cannot cost exactly the 14 SPP reported as spent under any rules set of the player's era",
        ],
      ]),
    );
  });

  it('reports a player no rules set prices', async () => {
    const { service, unspentSpp, deduction } = await makeService();
    unspentSpp.advancementInputsForPlayers.mockResolvedValue(new Map());

    expect(await service.spendProblems([order])).toEqual(
      new Map([
        [
          1,
          ' has no rules set that prices advancements, so the order cannot be checked against the SPP reported as spent',
        ],
      ]),
    );
    expect(deduction.deduce).not.toHaveBeenCalled();
  });

  it('accepts no paid advancement with nothing spent, and reports one with SPP spent, without pricing', async () => {
    const { service, unspentSpp } = await makeService();

    expect(
      await service.spendProblems([
        { ...order, rowIdsInOrder: [], spent: 0 },
        { ...order, playerId: 2, rowIdsInOrder: [], spent: 6 },
      ]),
    ).toEqual(
      new Map([[2, ' has no paid advancement, but 6 SPP reported as spent']]),
    );
    expect(unspentSpp.advancementInputsForPlayers).not.toHaveBeenCalled();
  });

  it('reports more paid advancements than can be checked, without pricing', async () => {
    const { service, unspentSpp } = await makeService();

    expect(
      await service.spendProblems([
        { ...order, rowIdsInOrder: [1, 2, 3, 4, 5, 6, 7], spent: 200 },
      ]),
    ).toEqual(
      new Map([[1, ' has 7 paid advancements; at most 6 can be checked']]),
    );
    expect(unspentSpp.advancementInputsForPlayers).not.toHaveBeenCalled();
  });

  it('prices several players with one input read', async () => {
    const { service, unspentSpp, deduction } = await makeService();
    unspentSpp.advancementInputsForPlayers.mockResolvedValue(
      new Map([
        [1, [rulesSetWith(false)]],
        [2, [rulesSetWith(false)]],
      ]),
    );
    deduction.deduce
      .mockReturnValueOnce(
        new Map([
          [11, 1],
          [12, 2],
        ]),
      )
      .mockReturnValueOnce(undefined);

    const problems = await service.spendProblems([
      order,
      { ...order, playerId: 2, spent: 9 },
    ]);

    expect(unspentSpp.advancementInputsForPlayers).toHaveBeenCalledTimes(1);
    expect(unspentSpp.advancementInputsForPlayers).toHaveBeenCalledWith([1, 2]);
    expect([...problems.keys()]).toEqual([2]);
  });
});

describe('AdvancementOrderSpendCheckService.plannedSpendProblem', () => {
  const order = (rowIdsInOrder: number[], spent: number) => ({
    playerId: 1,
    rowIdsInOrder,
    freeRowIds: new Set<number>(),
    spent,
  });

  it('accepts no paid advancement with nothing spent, without pricing', async () => {
    const { service, deduction } = await makeService();

    expect(service.plannedSpendProblem(order([], 0), [])).toBeUndefined();
    expect(deduction.deduce).not.toHaveBeenCalled();
  });

  it('reports no paid advancement with SPP spent', async () => {
    const { service } = await makeService();

    expect(service.plannedSpendProblem(order([], 4), [])).toBe(
      ' has no paid advancement, but 4 SPP reported as spent',
    );
  });

  it('reports more paid advancements than can be checked', async () => {
    const { service } = await makeService();

    expect(
      service.plannedSpendProblem(order([1, 2, 3, 4, 5, 6, 7], 70), []),
    ).toBe(' has 7 paid advancements; at most 6 can be checked');
  });

  it('reports a player no rules set prices', async () => {
    const { service } = await makeService();

    expect(service.plannedSpendProblem(order([11], 6), [])).toBe(
      ' has no rules set that prices advancements, so the order cannot be checked against the SPP reported as spent',
    );
  });

  it('prices the given inputs as the only allowed order, reading nothing', async () => {
    const { service, deduction, unspentSpp, db } = await makeService();
    deduction.deduce.mockReturnValue(new Map([[11, 1]]));

    expect(
      service.plannedSpendProblem(order([11], 6), [rulesSetWith(false)]),
    ).toBeUndefined();
    expect(deduction.deduce).toHaveBeenCalledWith(
      expect.objectContaining({
        newRowIds: [11],
        orderedRowIds: [11],
        firstNumber: 1,
        spent: 6,
      }),
    );
    expect(unspentSpp.advancementInputsForPlayers).not.toHaveBeenCalled();
    expect(db.db.select).not.toHaveBeenCalled();
  });

  it('reports an order the spend does not allow', async () => {
    const { service, deduction } = await makeService();
    deduction.deduce.mockReturnValue(undefined);

    expect(
      service.plannedSpendProblem(order([11], 7), [rulesSetWith(false)]),
    ).toBe(
      ": this order cannot cost exactly the 7 SPP reported as spent under any rules set of the player's era",
    );
  });
});
