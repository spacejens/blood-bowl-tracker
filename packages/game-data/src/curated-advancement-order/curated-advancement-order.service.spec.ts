import type { SyncPlayerSkills } from '@blood-bowl-tracker/api-contract';
import { DB, players } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { CuratedAdvancementOrderMatcherService } from '../player-skills/curated-advancement-order-matcher.service';
import { PlayerAdvancementReadsService } from '../player-skills/player-advancement-reads.service';
import { PlayerSkillsService } from '../player-skills/player-skills.service';
import { CuratedAdvancementOrderError } from '../shared/curated-advancement-order-error';
import type {
  SpendCheckRow,
  StoredWithFreeExtras,
} from '../spp/advancement-order-spend-check.service';
import { AdvancementOrderSpendCheckService } from '../spp/advancement-order-spend-check.service';
import { CuratedAdvancementOrderService } from './curated-advancement-order.service';

interface Harness {
  service: CuratedAdvancementOrderService;
  db: MockDbResult;
  playerSkills: MockProxy<PlayerSkillsService>;
  spendCheck: MockProxy<AdvancementOrderSpendCheckService>;
  reads: MockProxy<PlayerAdvancementReadsService>;
}

async function makeService(db: MockDbResult): Promise<Harness> {
  const playerSkills = mock<PlayerSkillsService>();
  const spendCheck = mock<AdvancementOrderSpendCheckService>();
  spendCheck.storedWithFreeExtras.mockResolvedValue(new Map());
  spendCheck.spendProblems.mockResolvedValue(new Map());
  const reads = mock<PlayerAdvancementReadsService>();
  reads.resolveFreeExtras.mockImplementation((entries) =>
    Promise.resolve(entries),
  );
  const moduleRef = await Test.createTestingModule({
    providers: [
      CuratedAdvancementOrderService,
      CuratedAdvancementOrderMatcherService,
      { provide: DB, useValue: db.db },
      { provide: PlayerSkillsService, useValue: playerSkills },
      { provide: AdvancementOrderSpendCheckService, useValue: spendCheck },
      { provide: PlayerAdvancementReadsService, useValue: reads },
    ],
  }).compile();
  return {
    service: moduleRef.get(CuratedAdvancementOrderService),
    db,
    playerSkills,
    spendCheck,
    reads,
  };
}

const row = (
  id: number,
  skillId: number,
  source: 'chosen' | 'random',
): SpendCheckRow => ({
  id,
  playerId: 1,
  skillId,
  characteristic: null,
  attributeValue: null,
  source,
  isFreeExtra: false,
  removed: false,
  advancementOrder: null,
  orderConfirmed: false,
});
const storedRows = [row(11, 8, 'chosen'), row(12, 9, 'random')];
const storedOf = (
  stored: SpendCheckRow[],
  extra: Partial<StoredWithFreeExtras> = {},
): Map<number, StoredWithFreeExtras> =>
  new Map([
    [1, { stored, freeRowIds: new Set<number>(), flagEntries: [], ...extra }],
  ]);

const data: SyncPlayerSkills = {
  entries: [
    {
      playerId: 1,
      skillId: 9,
      source: 'advancement',
      advancementOrder: 2,
      orderConfirmed: true,
    },
    {
      playerId: 1,
      skillId: 8,
      source: 'advancement',
      advancementOrder: 1,
      orderConfirmed: true,
    },
  ],
  characteristicPlayerIds: [1],
  checkOrderAgainstSpend: true,
};

describe('CuratedAdvancementOrderService', () => {
  it('checks the matched order against the spend, then syncs keeping the unspent SPP', async () => {
    const { service, db, playerSkills, spendCheck } = await makeService(
      mockDb([{ sppTotal: 20, unspentSpp: 6 }]),
    );
    spendCheck.reportedSpend.mockReturnValue({ kind: 'spent', spent: 14 });
    spendCheck.storedWithFreeExtras.mockResolvedValue(
      storedOf(storedRows, { freeRowIds: new Set([16]) }),
    );
    playerSkills.sync.mockResolvedValue({ playerSkillIds: [12, 11] });

    expect(await service.sync(data)).toEqual({ playerSkillIds: [12, 11] });
    expect(db.chains[0].from).toHaveBeenCalledWith(players);
    expect(spendCheck.reportedSpend).toHaveBeenCalledWith({
      sppTotal: 20,
      unspentSpp: 6,
    });
    expect(spendCheck.storedWithFreeExtras).toHaveBeenCalledWith([1]);
    expect(spendCheck.spendProblems).toHaveBeenCalledWith([
      {
        playerId: 1,
        rowIdsInOrder: [11, 12],
        freeRowIds: new Set([16]),
        spent: 14,
      },
    ]);
    expect(playerSkills.sync).toHaveBeenCalledWith(data, {
      keepUnspentSpp: true,
    });
  });

  it('refuses an order the spend does not allow, writing nothing', async () => {
    const { service, playerSkills, spendCheck } = await makeService(
      mockDb([{ sppTotal: 20, unspentSpp: 6 }]),
    );
    spendCheck.reportedSpend.mockReturnValue({ kind: 'spent', spent: 14 });
    spendCheck.storedWithFreeExtras.mockResolvedValue(storedOf(storedRows));
    spendCheck.spendProblems.mockResolvedValue(
      new Map([
        [1, ': this order cannot cost exactly the 14 SPP reported as spent'],
      ]),
    );

    await expect(service.sync(data)).rejects.toThrow(
      new CuratedAdvancementOrderError(
        'Player 1: this order cannot cost exactly the 14 SPP reported as spent',
      ),
    );
    expect(playerSkills.sync).not.toHaveBeenCalled();
  });

  it('writes the order unchecked when the SPP figures are unknown', async () => {
    const { service, playerSkills, spendCheck } = await makeService(
      mockDb([{ sppTotal: 20, unspentSpp: null }]),
    );
    spendCheck.reportedSpend.mockReturnValue({ kind: 'unknown' });
    spendCheck.storedWithFreeExtras.mockResolvedValue(storedOf(storedRows));
    playerSkills.sync.mockResolvedValue({ playerSkillIds: [12, 11] });

    expect(await service.sync(data)).toEqual({ playerSkillIds: [12, 11] });
    expect(spendCheck.spendProblems).not.toHaveBeenCalled();
    expect(playerSkills.sync).toHaveBeenCalledWith(data, {
      keepUnspentSpp: true,
    });
  });

  it('refuses inconsistent figures before reading the stored rows', async () => {
    const { service, playerSkills, spendCheck } = await makeService(
      mockDb([{ sppTotal: 20, unspentSpp: 21 }]),
    );
    spendCheck.reportedSpend.mockReturnValue({
      kind: 'inconsistent',
      problem: ' has an unspent SPP figure outside 0 to the SPP total',
    });

    await expect(service.sync(data)).rejects.toThrow(
      'Player 1 has an unspent SPP figure outside 0 to the SPP total',
    );
    expect(spendCheck.storedWithFreeExtras).not.toHaveBeenCalled();
    expect(playerSkills.sync).not.toHaveBeenCalled();
  });

  it('appends the entries flagging stored free extras and returns only the caller ids', async () => {
    const { service, playerSkills, spendCheck } = await makeService(
      mockDb([{ sppTotal: 20, unspentSpp: 6 }]),
    );
    const flag = {
      playerId: 1,
      skillId: 10,
      source: 'advancement' as const,
      attributeValue: '2+',
      isFreeExtra: true,
    };
    spendCheck.reportedSpend.mockReturnValue({ kind: 'spent', spent: 14 });
    spendCheck.storedWithFreeExtras.mockResolvedValue(
      storedOf(storedRows, { flagEntries: [flag] }),
    );
    playerSkills.sync.mockResolvedValue({ playerSkillIds: [12, 11, 13] });

    expect(await service.sync(data)).toEqual({ playerSkillIds: [12, 11] });
    expect(playerSkills.sync).toHaveBeenCalledWith(
      { ...data, entries: [...data.entries, flag] },
      { keepUnspentSpp: true },
    );
  });

  it('checks a player with no stored rows and no entries as having no paid advancement', async () => {
    const noOrder: SyncPlayerSkills = {
      entries: [],
      characteristicPlayerIds: [1],
      checkOrderAgainstSpend: true,
    };
    const { service, playerSkills, spendCheck } = await makeService(
      mockDb([{ sppTotal: 0, unspentSpp: 0 }]),
    );
    spendCheck.reportedSpend.mockReturnValue({ kind: 'spent', spent: 0 });
    playerSkills.sync.mockResolvedValue({ playerSkillIds: [] });

    expect(await service.sync(noOrder)).toEqual({ playerSkillIds: [] });
    expect(spendCheck.spendProblems).toHaveBeenCalledWith([
      { playerId: 1, rowIdsInOrder: [], freeRowIds: new Set(), spent: 0 },
    ]);
  });

  it('refuses a skill the free-extra rules make free', async () => {
    const { service, reads, playerSkills, spendCheck } = await makeService(
      mockDb([{ sppTotal: 20, unspentSpp: 6 }]),
    );
    spendCheck.reportedSpend.mockReturnValue({ kind: 'spent', spent: 14 });
    spendCheck.storedWithFreeExtras.mockResolvedValue(storedOf(storedRows));
    reads.resolveFreeExtras.mockResolvedValueOnce(
      data.entries.map((entry) =>
        entry.skillId === 9 ? { ...entry, isFreeExtra: true } : entry,
      ),
    );

    await expect(service.sync(data)).rejects.toThrow(
      'Player 1 lists skill 9, which is not a paid advancement',
    );
    expect(playerSkills.sync).not.toHaveBeenCalled();
  });

  it('refuses a player that does not exist', async () => {
    const { service } = await makeService(mockDb([]));

    await expect(service.sync(data)).rejects.toThrow('Player 1 does not exist');
  });

  it('refuses an entry that does not match the stored paid advancements, without pricing', async () => {
    const { service, spendCheck } = await makeService(
      mockDb([{ sppTotal: 20, unspentSpp: 6 }]),
    );
    spendCheck.reportedSpend.mockReturnValue({ kind: 'spent', spent: 14 });
    spendCheck.storedWithFreeExtras.mockResolvedValue(
      storedOf([storedRows[0]]),
    );

    await expect(service.sync(data)).rejects.toThrow(
      'Player 1 has no paid advancement matching skill 9',
    );
    expect(spendCheck.spendProblems).not.toHaveBeenCalled();
  });
});
