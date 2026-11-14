import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { AdvancementOrderSpendCheckService } from '../spp/advancement-order-spend-check.service';
import { UnspentSppService } from '../spp/unspent-spp.service';
import type { RulesSetAdvancementInput } from '../spp/unspent-spp.types';
import type { PlannedFillRow } from './player-fill.types';
import { PlayerFillSpendCheckService } from './player-fill-spend-check.service';

interface Harness {
  service: PlayerFillSpendCheckService;
  db: MockDbResult;
  unspentSpp: MockProxy<UnspentSppService>;
  spendCheck: MockProxy<AdvancementOrderSpendCheckService>;
}

async function makeService(db: MockDbResult = mockDb()): Promise<Harness> {
  const unspentSpp = mock<UnspentSppService>();
  const spendCheck = mock<AdvancementOrderSpendCheckService>();
  spendCheck.reportedSpend.mockReturnValue({ kind: 'spent', spent: 6 });
  const moduleRef = await Test.createTestingModule({
    providers: [
      PlayerFillSpendCheckService,
      { provide: DB, useValue: db.db },
      { provide: UnspentSppService, useValue: unspentSpp },
      { provide: AdvancementOrderSpendCheckService, useValue: spendCheck },
    ],
  }).compile();
  return {
    service: moduleRef.get(PlayerFillSpendCheckService),
    db,
    unspentSpp,
    spendCheck,
  };
}

const row = (overrides: Partial<PlannedFillRow>): PlannedFillRow => ({
  skillId: 71,
  characteristic: null,
  attributeValue: null,
  source: 'chosen',
  isFreeExtra: false,
  paidNumber: 1,
  ...overrides,
});

const planned: PlannedFillRow[] = [
  row({ skillId: 70, source: 'starting', paidNumber: null }),
  row({ skillId: 71 }),
  row({
    skillId: 72,
    source: 'advancement',
    isFreeExtra: true,
    paidNumber: null,
  }),
  row({
    skillId: null,
    characteristic: 'AG',
    source: 'characteristic',
    paidNumber: 2,
  }),
];

const storedInput: RulesSetAdvancementInput = {
  rulesSetId: 2,
  pricingModel: 'kind_priced',
  costs: [],
  candidatesInput: {
    skills: [],
    skillCategories: new Map([[70, 'general']]),
    positionAccess: new Map([['agility', 'primary']]),
    costs: [],
  },
};

const candidate = (
  id: number,
  skillId: number | null,
  rest: Pick<PlannedFillRow, 'source'> & { isFreeExtra?: boolean },
) => ({
  id,
  skillId,
  source: rest.source,
  isFreeExtra: rest.isFreeExtra ?? false,
  advancementOrder: null,
  orderConfirmed: false,
});

describe('PlayerFillSpendCheckService', () => {
  it('reports SPP figures that contradict each other, reading nothing', async () => {
    const { service, spendCheck, unspentSpp } = await makeService();
    spendCheck.reportedSpend.mockReturnValue({
      kind: 'inconsistent',
      problem: ' has an unspent SPP figure outside 0 to the SPP total',
    });

    await expect(
      service.problem({ playerId: 9, planned, sppTotal: 2, unspentSpp: 5 }),
    ).resolves.toBe(' has an unspent SPP figure outside 0 to the SPP total');
    expect(spendCheck.reportedSpend).toHaveBeenCalledWith(
      expect.objectContaining({ sppTotal: 2, unspentSpp: 5 }),
    );
    expect(unspentSpp.advancementInputsForPlayers).not.toHaveBeenCalled();
  });

  it("prices the planned rows in place of the stored ones, under the era's rules sets", async () => {
    const db = mockDb([
      { skillId: 71, rulesSetId: 2, category: 'agility' },
      { skillId: 72, rulesSetId: 3, category: 'general' },
    ]);
    const { service, unspentSpp, spendCheck } = await makeService(db);
    unspentSpp.advancementInputsForPlayers.mockResolvedValue(
      new Map([[9, [storedInput]]]),
    );
    spendCheck.plannedSpendProblem.mockReturnValue(undefined);

    await expect(
      service.problem({ playerId: 9, planned, sppTotal: 8, unspentSpp: 2 }),
    ).resolves.toBeUndefined();

    expect(unspentSpp.advancementInputsForPlayers).toHaveBeenCalledWith([9]);
    const [order, rulesSets] = spendCheck.plannedSpendProblem.mock.calls[0];
    expect(order).toEqual({
      playerId: 9,
      rowIdsInOrder: [2, 4],
      freeRowIds: new Set([3]),
      spent: 6,
    });
    expect(rulesSets).toEqual([
      {
        ...storedInput,
        candidatesInput: {
          ...storedInput.candidatesInput,
          skills: [
            candidate(1, 70, { source: 'starting' }),
            candidate(2, 71, { source: 'chosen' }),
            candidate(3, 72, { source: 'advancement', isFreeExtra: true }),
            candidate(4, null, { source: 'characteristic' }),
          ],
          skillCategories: new Map([[71, 'agility']]),
        },
      },
    ]);
  });

  it('passes on the problem the spend check finds', async () => {
    const { service, unspentSpp, spendCheck } = await makeService();
    unspentSpp.advancementInputsForPlayers.mockResolvedValue(new Map());
    spendCheck.plannedSpendProblem.mockReturnValue(
      ' has no rules set that prices advancements, so the order cannot be checked against the SPP reported as spent',
    );

    await expect(
      service.problem({ playerId: 9, planned, sppTotal: 8, unspentSpp: 2 }),
    ).resolves.toBe(
      ' has no rules set that prices advancements, so the order cannot be checked against the SPP reported as spent',
    );
    expect(spendCheck.plannedSpendProblem.mock.calls[0][1]).toEqual([]);
  });

  it('reads no categories when there is no rules set or no skill to ask about', async () => {
    const { service, unspentSpp, spendCheck, db } = await makeService();
    unspentSpp.advancementInputsForPlayers.mockResolvedValue(new Map());
    spendCheck.plannedSpendProblem.mockReturnValue(undefined);

    await service.problem({
      playerId: 9,
      planned: [],
      sppTotal: 0,
      unspentSpp: 0,
    });

    expect(db.db.select).not.toHaveBeenCalled();
  });
});
