import type { SyncPlayerSkills } from '@blood-bowl-tracker/api-contract';
import { DB, playerAdvancements, players } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { CuratedAdvancementOrderMatcherService } from '../player-skills/curated-advancement-order-matcher.service';
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
}

async function makeService(
  db: MockDbResult,
): Promise<{ service: CuratedAdvancementOrderService } & Collaborators> {
  const playerSkills = mock<PlayerSkillsService>();
  const unspentSpp = mock<UnspentSppService>();
  const deduction = mock<AdvancementOrderDeductionService>();
  const moduleRef = await Test.createTestingModule({
    providers: [
      CuratedAdvancementOrderService,
      CuratedAdvancementOrderMatcherService,
      { provide: DB, useValue: db.db },
      { provide: PlayerSkillsService, useValue: playerSkills },
      { provide: UnspentSppService, useValue: unspentSpp },
      { provide: AdvancementOrderDeductionService, useValue: deduction },
    ],
  }).compile();
  return {
    service: moduleRef.get(CuratedAdvancementOrderService),
    db,
    playerSkills,
    unspentSpp,
    deduction,
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

const rulesSets = [{} as RulesSetAdvancementInput];

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

  it('refuses a player with no reported unspent figure', async () => {
    const { service, playerSkills } = await makeService(
      mockDb([{ sppTotal: 20, unspentSpp: null }]),
    );

    await expect(service.sync(data)).rejects.toThrow(
      'Player 1 has no consistent reported SPP total and unspent figure to check the order against',
    );
    expect(playerSkills.sync).not.toHaveBeenCalled();
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
