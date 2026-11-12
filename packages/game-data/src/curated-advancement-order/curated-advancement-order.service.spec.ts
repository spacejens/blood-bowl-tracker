import type { SyncPlayerSkills } from '@blood-bowl-tracker/api-contract';
import { DB, playerAdvancements, players } from '@blood-bowl-tracker/db';
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
import { AdvancementOrderDeductionService } from '../spp/advancement-order-deduction.service';
import { UnspentSppService } from '../spp/unspent-spp.service';
import type { RulesSetAdvancementInput } from '../spp/unspent-spp.types';
import { CuratedAdvancementOrderService } from './curated-advancement-order.service';

interface Collaborators {
  db: MockDbResult;
  playerSkills: MockProxy<PlayerSkillsService>;
  unspentSpp: MockProxy<UnspentSppService>;
  deduction: MockProxy<AdvancementOrderDeductionService>;
  reads: MockProxy<PlayerAdvancementReadsService>;
}

async function makeService(
  db: MockDbResult,
): Promise<{ service: CuratedAdvancementOrderService } & Collaborators> {
  const playerSkills = mock<PlayerSkillsService>();
  const unspentSpp = mock<UnspentSppService>();
  const deduction = mock<AdvancementOrderDeductionService>();
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
      { provide: UnspentSppService, useValue: unspentSpp },
      { provide: AdvancementOrderDeductionService, useValue: deduction },
      { provide: PlayerAdvancementReadsService, useValue: reads },
    ],
  }).compile();
  return {
    service: moduleRef.get(CuratedAdvancementOrderService),
    db,
    playerSkills,
    unspentSpp,
    deduction,
    reads,
  };
}

const storedRows = [
  {
    id: 11,
    skillId: 8,
    characteristic: null,
    attributeValue: null,
    source: 'chosen',
    isFreeExtra: false,
    removed: false,
  },
  {
    id: 12,
    skillId: 9,
    characteristic: null,
    attributeValue: null,
    source: 'random',
    isFreeExtra: false,
    removed: false,
  },
];

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

const rulesSets = [rulesSetWith(false)];

describe('CuratedAdvancementOrderService', () => {
  it('prices the order as the only allowed one, then syncs keeping the unspent SPP', async () => {
    const { service, db, playerSkills, unspentSpp, deduction } =
      await makeService(mockDb([{ sppTotal: 20, unspentSpp: 6 }], storedRows));
    unspentSpp.advancementInputsForPlayers.mockResolvedValue(
      new Map([[1, rulesSets]]),
    );
    deduction.deduce.mockReturnValue(
      new Map([
        [11, 1],
        [12, 2],
      ]),
    );
    playerSkills.sync.mockResolvedValue({ playerSkillIds: [12, 11] });

    expect(await service.sync(data)).toEqual({ playerSkillIds: [12, 11] });
    expect(db.chains[0].from).toHaveBeenCalledWith(players);
    expect(db.chains[1].from).toHaveBeenCalledWith(playerAdvancements);
    expect(deduction.deduce).toHaveBeenCalledWith({
      rulesSets,
      newRowIds: [11, 12],
      orderedRowIds: [11, 12],
      firstNumber: 1,
      spent: 14,
    });
    expect(playerSkills.sync).toHaveBeenCalledWith(data, {
      keepUnspentSpp: true,
    });
  });

  it('refuses an order the spend does not allow, writing nothing', async () => {
    const { service, playerSkills, unspentSpp, deduction } = await makeService(
      mockDb([{ sppTotal: 20, unspentSpp: 6 }], storedRows),
    );
    unspentSpp.advancementInputsForPlayers.mockResolvedValue(
      new Map([[1, rulesSets]]),
    );
    deduction.deduce.mockReturnValue(undefined);

    await expect(service.sync(data)).rejects.toThrow(
      new CuratedAdvancementOrderError(
        "Player 1: this order cannot cost exactly the 14 SPP reported as spent under any rules set of the player's era",
      ),
    );
    expect(playerSkills.sync).not.toHaveBeenCalled();
  });

  it.each([
    ['total', { sppTotal: null, unspentSpp: 6 }],
    ['unspent', { sppTotal: 20, unspentSpp: null }],
  ])(
    'writes the order unchecked when the %s SPP is unknown',
    async (_unused, figures) => {
      const { service, playerSkills, unspentSpp, deduction } =
        await makeService(mockDb([figures], storedRows));
      playerSkills.sync.mockResolvedValue({ playerSkillIds: [12, 11] });

      expect(await service.sync(data)).toEqual({ playerSkillIds: [12, 11] });
      expect(unspentSpp.advancementInputsForPlayers).not.toHaveBeenCalled();
      expect(deduction.deduce).not.toHaveBeenCalled();
      expect(playerSkills.sync).toHaveBeenCalledWith(data, {
        keepUnspentSpp: true,
      });
    },
  );

  it.each([
    ['unspent is negative', { sppTotal: 20, unspentSpp: -1 }],
    ['unspent exceeds the total', { sppTotal: 20, unspentSpp: 21 }],
  ])('refuses figures where %s', async (_unused, figures) => {
    const { service, playerSkills } = await makeService(mockDb([figures]));

    await expect(service.sync(data)).rejects.toThrow(
      'Player 1 has an unspent SPP figure outside 0 to the SPP total',
    );
    expect(playerSkills.sync).not.toHaveBeenCalled();
  });

  it('refuses known figures when no rules set prices advancements', async () => {
    const { service, playerSkills, unspentSpp, deduction } = await makeService(
      mockDb([{ sppTotal: 20, unspentSpp: 6 }], storedRows),
    );
    unspentSpp.advancementInputsForPlayers.mockResolvedValue(new Map());

    await expect(service.sync(data)).rejects.toThrow(
      'Player 1 has no rules set that prices advancements',
    );
    expect(deduction.deduce).not.toHaveBeenCalled();
    expect(playerSkills.sync).not.toHaveBeenCalled();
  });

  it('refuses a skill the free-extra rules make free', async () => {
    const { service, reads, playerSkills } = await makeService(
      mockDb([{ sppTotal: 20, unspentSpp: 6 }], storedRows),
    );
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

  describe('with a stored gained skill whose free-extra flag is not set yet', () => {
    const unflaggedLoner = {
      id: 13,
      skillId: 10,
      characteristic: null,
      attributeValue: '2+',
      source: 'advancement',
      isFreeExtra: false,
      removed: false,
    };
    const stored = [
      ...storedRows,
      unflaggedLoner,
      { ...unflaggedLoner, id: 14, skillId: 11, source: 'starting' },
      { ...unflaggedLoner, id: 15, skillId: 12, removed: true },
      { ...unflaggedLoner, id: 16, skillId: 13, isFreeExtra: true },
    ];
    it('treats it as free when the rules make it free: matched, priced and flagged by the sync', async () => {
      const { service, reads, playerSkills, unspentSpp, deduction } =
        await makeService(mockDb([{ sppTotal: 20, unspentSpp: 6 }], stored));
      const offered = (skillId: number, source: string) => ({
        playerId: 1,
        skillId,
        source,
        attributeValue: skillId === 10 ? '2+' : null,
      });
      reads.resolveFreeExtras
        .mockResolvedValueOnce(data.entries)
        .mockResolvedValueOnce([
          offered(8, 'chosen'),
          offered(9, 'random'),
          { ...offered(10, 'advancement'), isFreeExtra: true },
        ]);
      unspentSpp.advancementInputsForPlayers.mockResolvedValue(
        new Map([[1, [rulesSetWith(false)]]]),
      );
      deduction.deduce.mockReturnValue(
        new Map([
          [11, 1],
          [12, 2],
        ]),
      );
      playerSkills.sync.mockResolvedValue({ playerSkillIds: [12, 11, 13] });

      expect(await service.sync(data)).toEqual({ playerSkillIds: [12, 11] });
      // Only gained, active, unflagged skill rows are offered to the rules.
      expect(reads.resolveFreeExtras).toHaveBeenLastCalledWith([
        { playerId: 1, skillId: 8, source: 'chosen', attributeValue: null },
        { playerId: 1, skillId: 9, source: 'random', attributeValue: null },
        {
          playerId: 1,
          skillId: 10,
          source: 'advancement',
          attributeValue: '2+',
        },
      ]);
      expect(deduction.deduce).toHaveBeenCalledWith({
        rulesSets: [rulesSetWith(true)],
        newRowIds: [11, 12],
        orderedRowIds: [11, 12],
        firstNumber: 1,
        spent: 14,
      });
      expect(playerSkills.sync).toHaveBeenCalledWith(
        {
          ...data,
          entries: [
            ...data.entries,
            {
              playerId: 1,
              skillId: 10,
              source: 'advancement',
              attributeValue: '2+',
              isFreeExtra: true,
            },
          ],
        },
        { keepUnspentSpp: true },
      );
    });

    it('counts it as paid when the rules leave it paid', async () => {
      const { service, playerSkills } = await makeService(
        mockDb([{ sppTotal: 20, unspentSpp: 6 }], stored),
      );

      await expect(service.sync(data)).rejects.toThrow(
        'Player 1 has 3 paid advancements, but the entries list 2',
      );
      expect(playerSkills.sync).not.toHaveBeenCalled();
    });
  });

  it('refuses a player that does not exist', async () => {
    const { service } = await makeService(mockDb([]));

    await expect(service.sync(data)).rejects.toThrow('Player 1 does not exist');
  });

  it('refuses an entry that does not match the stored paid advancements', async () => {
    const { service, deduction } = await makeService(
      mockDb([{ sppTotal: 20, unspentSpp: 6 }], [storedRows[0]]),
    );

    await expect(service.sync(data)).rejects.toThrow(
      'Player 1 has no paid advancement matching skill 9',
    );
    expect(deduction.deduce).not.toHaveBeenCalled();
  });

  it('refuses a listed player with no entries', async () => {
    const { service } = await makeService(
      mockDb([{ sppTotal: 20, unspentSpp: 6 }], storedRows),
    );

    await expect(
      service.sync({
        entries: [],
        characteristicPlayerIds: [1],
        checkOrderAgainstSpend: true,
      }),
    ).rejects.toThrow('Player 1 lists no advancements');
  });

  it('refuses more paid advancements than can be checked', async () => {
    const many = Array.from({ length: 7 }, (_unused, at) => ({
      ...storedRows[0],
      id: 20 + at,
      skillId: 30 + at,
    }));
    const { service, deduction } = await makeService(
      mockDb([{ sppTotal: 200, unspentSpp: 0 }], many),
    );

    await expect(
      service.sync({
        entries: many.map((row, at) => ({
          playerId: 1,
          skillId: row.skillId,
          source: 'advancement' as const,
          advancementOrder: at + 1,
          orderConfirmed: true,
        })),
        checkOrderAgainstSpend: true,
      }),
    ).rejects.toThrow(
      'Player 1 has 7 paid advancements; at most 6 can be checked',
    );
    expect(deduction.deduce).not.toHaveBeenCalled();
  });
});
