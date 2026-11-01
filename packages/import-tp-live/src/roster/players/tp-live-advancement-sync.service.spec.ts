import type {
  ImportError,
  PlayerSkillEntry,
} from '@blood-bowl-tracker/api-contract';
import type { PlayerCharacteristicCounts } from '@blood-bowl-tracker/domain-enums';
import type {
  RulesSetAdvancementInput,
  StoredPlayerAdvancement,
} from '@blood-bowl-tracker/game-data';
import {
  AdvancementOrderDeductionService,
  PlayerAdvancementReadsService,
  PlayerSkillsService,
  UnspentSppService,
} from '@blood-bowl-tracker/game-data';
import { UpsertRecorderService } from '@blood-bowl-tracker/import-shared';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { LiveAdvancementPlan } from './tp-advancement-order.service';
import { TpAdvancementOrderService } from './tp-advancement-order.service';
import type { LivePlayerSyncOptions } from './tp-live-advancement-sync.service';
import { TpLiveAdvancementSyncService } from './tp-live-advancement-sync.service';

const PLAYER_ID = 700;
const INCREASES: PlayerCharacteristicCounts = {
  MA: 0,
  ST: 1,
  AG: 0,
  PA: 0,
  AV: 0,
};
const STORED: StoredPlayerAdvancement[] = [
  {
    skillId: 7,
    attributeValue: null,
    characteristic: null,
    source: 'chosen',
    advancementOrder: 1,
    orderConfirmed: false,
    isFreeExtra: false,
  },
];
const SKILL_ENTRIES: PlayerSkillEntry[] = [
  { playerId: PLAYER_ID, skillId: 7, source: 'chosen', advancementOrder: 1 },
  { playerId: PLAYER_ID, skillId: 8, source: 'chosen', advancementOrder: 5 },
];
const SKILL_8_PENDING: PlayerSkillEntry = {
  playerId: PLAYER_ID,
  skillId: 8,
  source: 'chosen',
  advancementOrder: 2,
};
const ST_PENDING: PlayerSkillEntry = {
  playerId: PLAYER_ID,
  source: 'characteristic',
  characteristic: 'ST',
  advancementOrder: 3,
};
/** Two new advancements (skill 8 and an ST increase) left to deduce. */
const PENDING_PLAN: LiveAdvancementPlan = {
  entries: [SKILL_ENTRIES[0], SKILL_8_PENDING, ST_PENDING],
  pendingIndexes: [1, 2],
  firstNumber: 2,
};
const RULES_SETS: RulesSetAdvancementInput[] = [
  {
    rulesSetId: 3,
    pricingModel: 'kind_priced',
    costs: [],
    candidatesInput: {
      skills: [],
      skillCategories: new Map(),
      positionAccess: new Map(),
      costs: [],
    },
  },
];

describe('TpLiveAdvancementSyncService', () => {
  let service: TpLiveAdvancementSyncService;
  let reads: MockProxy<PlayerAdvancementReadsService>;
  let playerSkills: MockProxy<PlayerSkillsService>;
  let order: MockProxy<TpAdvancementOrderService>;
  let unspentSpp: MockProxy<UnspentSppService>;
  let deduction: MockProxy<AdvancementOrderDeductionService>;
  let errors: ImportError[];

  beforeEach(async () => {
    reads = mock<PlayerAdvancementReadsService>();
    playerSkills = mock<PlayerSkillsService>();
    order = mock<TpAdvancementOrderService>();
    unspentSpp = mock<UnspentSppService>();
    deduction = mock<AdvancementOrderDeductionService>();
    reads.listStoredAdvancements.mockResolvedValue(STORED);
    order.liveEntries.mockReturnValue(PENDING_PLAN);
    playerSkills.sync.mockResolvedValue({ playerSkillIds: [40, 41, 42] });
    unspentSpp.advancementInputsForPlayers.mockResolvedValue(
      new Map([[PLAYER_ID, RULES_SETS]]),
    );
    errors = [];
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpLiveAdvancementSyncService,
        { provide: PlayerAdvancementReadsService, useValue: reads },
        { provide: PlayerSkillsService, useValue: playerSkills },
        { provide: TpAdvancementOrderService, useValue: order },
        { provide: UnspentSppService, useValue: unspentSpp },
        { provide: AdvancementOrderDeductionService, useValue: deduction },
        // Constructor-free exception classification, passed real so the
        // recorded errors are the real ones.
        UpsertRecorderService,
      ],
    }).compile();
    service = moduleRef.get(TpLiveAdvancementSyncService);
  });

  const syncPlayer = (overrides: Partial<LivePlayerSyncOptions> = {}) =>
    service.syncPlayer({
      player: { id: 5001, name: 'Grim' },
      playerId: PLAYER_ID,
      skillEntries: SKILL_ENTRIES,
      increases: INCREASES,
      snapshot: { unspentSpp: 4, snapshotSppTotal: 35 },
      errors,
      ...overrides,
    });

  it('plans from the stored rows and writes once when nothing is pending', async () => {
    const plan: LiveAdvancementPlan = {
      entries: [SKILL_ENTRIES[0], { ...SKILL_8_PENDING, orderConfirmed: true }],
      pendingIndexes: [],
      firstNumber: 2,
    };
    order.liveEntries.mockReturnValue(plan);

    await expect(syncPlayer()).resolves.toBe(true);

    expect(order.liveEntries).toHaveBeenCalledWith({
      playerId: PLAYER_ID,
      skillEntries: SKILL_ENTRIES,
      increases: INCREASES,
      stored: STORED,
      checkSpend: true,
    });
    expect(playerSkills.sync).toHaveBeenCalledTimes(1);
    expect(playerSkills.sync).toHaveBeenCalledWith({
      entries: plan.entries,
      characteristicPlayerIds: [PLAYER_ID],
    });
    expect(unspentSpp.advancementInputsForPlayers).not.toHaveBeenCalled();
    expect(deduction.deduce).not.toHaveBeenCalled();
  });

  it('writes the one order the spent SPP allows, confirmed', async () => {
    deduction.deduce.mockReturnValue(
      new Map([
        [41, 3],
        [42, 2],
      ]),
    );

    await expect(syncPlayer()).resolves.toBe(true);

    expect(unspentSpp.advancementInputsForPlayers).toHaveBeenCalledWith([
      PLAYER_ID,
    ]);
    expect(deduction.deduce).toHaveBeenCalledWith({
      rulesSets: RULES_SETS,
      newRowIds: [41, 42],
      firstNumber: 2,
      spent: 31,
    });
    expect(playerSkills.sync).toHaveBeenCalledTimes(2);
    expect(playerSkills.sync).toHaveBeenNthCalledWith(1, {
      entries: PENDING_PLAN.entries,
      characteristicPlayerIds: [PLAYER_ID],
    });
    expect(playerSkills.sync).toHaveBeenNthCalledWith(2, {
      entries: [
        SKILL_ENTRIES[0],
        { ...SKILL_8_PENDING, advancementOrder: 3, orderConfirmed: true },
        { ...ST_PENDING, advancementOrder: 2, orderConfirmed: true },
      ],
      characteristicPlayerIds: [PLAYER_ID],
    });
  });

  it('confirms the fallback order when the deduction returns it', async () => {
    deduction.deduce.mockReturnValue(
      new Map([
        [41, 2],
        [42, 3],
      ]),
    );

    await syncPlayer();

    expect(playerSkills.sync).toHaveBeenNthCalledWith(2, {
      entries: [
        SKILL_ENTRIES[0],
        { ...SKILL_8_PENDING, orderConfirmed: true },
        { ...ST_PENDING, orderConfirmed: true },
      ],
      characteristicPlayerIds: [PLAYER_ID],
    });
  });

  it('keeps the unconfirmed write when no single order is known', async () => {
    deduction.deduce.mockReturnValue(undefined);

    await expect(syncPlayer()).resolves.toBe(true);

    expect(playerSkills.sync).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['no snapshot', undefined],
    ['a negative unspent figure', { unspentSpp: -1, snapshotSppTotal: 35 }],
    [
      'an unspent figure above the total',
      { unspentSpp: 36, snapshotSppTotal: 35 },
    ],
  ])('deduces nothing with %s', async (_label, snapshot) => {
    await expect(syncPlayer({ snapshot })).resolves.toBe(true);

    expect(order.liveEntries).toHaveBeenCalledWith(
      expect.objectContaining({ checkSpend: false }),
    );
    expect(unspentSpp.advancementInputsForPlayers).not.toHaveBeenCalled();
    expect(deduction.deduce).not.toHaveBeenCalled();
    expect(playerSkills.sync).toHaveBeenCalledTimes(1);
  });

  it('confirms a lone pending advancement the spent SPP allows', async () => {
    order.liveEntries.mockReturnValue({
      entries: [SKILL_ENTRIES[0], SKILL_8_PENDING],
      pendingIndexes: [1],
      firstNumber: 2,
    });
    playerSkills.sync.mockResolvedValue({ playerSkillIds: [40, 41] });
    deduction.deduce.mockReturnValue(new Map([[41, 2]]));

    await syncPlayer();

    expect(deduction.deduce).toHaveBeenCalledWith({
      rulesSets: RULES_SETS,
      newRowIds: [41],
      firstNumber: 2,
      spent: 31,
    });
    expect(playerSkills.sync).toHaveBeenNthCalledWith(2, {
      entries: [SKILL_ENTRIES[0], { ...SKILL_8_PENDING, orderConfirmed: true }],
      characteristicPlayerIds: [PLAYER_ID],
    });
  });

  it('leaves a lone pending advancement unconfirmed when the spend does not allow it', async () => {
    order.liveEntries.mockReturnValue({
      entries: [SKILL_ENTRIES[0], SKILL_8_PENDING],
      pendingIndexes: [1],
      firstNumber: 2,
    });
    playerSkills.sync.mockResolvedValue({ playerSkillIds: [40, 41] });
    deduction.deduce.mockReturnValue(undefined);

    await syncPlayer();

    expect(playerSkills.sync).toHaveBeenCalledTimes(1);
    expect(playerSkills.sync).toHaveBeenCalledWith({
      entries: [SKILL_ENTRIES[0], SKILL_8_PENDING],
      characteristicPlayerIds: [PLAYER_ID],
    });
  });

  it('records a failed read of the stored rows and writes nothing', async () => {
    reads.listStoredAdvancements.mockRejectedValue(new Error('db down'));

    await expect(syncPlayer()).resolves.toBe(false);

    expect(playerSkills.sync).not.toHaveBeenCalled();
    expect(errors).toEqual([
      {
        item: { lineUpId: 5001, playerId: PLAYER_ID },
        message:
          'Failed to read the stored advancements of player "Grim" (5001): db down',
      },
    ]);
  });

  it('deduces nothing after a failed first write', async () => {
    playerSkills.sync.mockRejectedValue(new Error('rejected'));

    await expect(syncPlayer()).resolves.toBe(false);

    expect(deduction.deduce).not.toHaveBeenCalled();
    expect(errors).toEqual([
      {
        item: { lineUpId: 5001, playerId: PLAYER_ID },
        message:
          'Failed to write 3 advancement(s) of player "Grim" (5001): rejected',
      },
    ]);
  });

  it('records a failed read of the advancement inputs and keeps the unconfirmed write', async () => {
    unspentSpp.advancementInputsForPlayers.mockRejectedValue(
      new Error('timeout'),
    );
    deduction.deduce.mockReturnValue(undefined);

    await expect(syncPlayer()).resolves.toBe(true);

    expect(deduction.deduce).toHaveBeenCalledWith(
      expect.objectContaining({ rulesSets: [] }),
    );
    expect(playerSkills.sync).toHaveBeenCalledTimes(1);
    expect(errors).toEqual([
      {
        item: { lineUpId: 5001, playerId: PLAYER_ID },
        message:
          'Failed to price the new advancements of player "Grim" (5001): timeout',
      },
    ]);
  });

  it('states no increases in either write when they are unknown', async () => {
    deduction.deduce.mockReturnValue(
      new Map([
        [41, 2],
        [42, 3],
      ]),
    );

    await syncPlayer({ increases: undefined });

    expect(playerSkills.sync).toHaveBeenCalledTimes(2);
    for (const [input] of playerSkills.sync.mock.calls) {
      expect(input).not.toHaveProperty('characteristicPlayerIds');
    }
  });
});
