import type {
  FillIncompletePlayer,
  PlayerSkillEntry,
} from '@blood-bowl-tracker/api-contract';
import { DB, players } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { JourneymanLonerService } from '../player-skills/journeyman-loner.service';
import { PlayerAdvancementReadsService } from '../player-skills/player-advancement-reads.service';
import { PlayerSkillsService } from '../player-skills/player-skills.service';
import { PlayerCharacteristicsValidationService } from '../players/player-characteristics-validation.service';
import { CharacteristicFormatMismatchError } from '../shared/characteristic-format-mismatch-error';
import { IncompletePlayerFillError } from '../shared/incomplete-player-fill-error';
import { SppTotalsService } from '../spp/spp-totals.service';
import { PlayerFillService } from './player-fill.service';
import type {
  LastingReductionCounts,
  PlayerFillState,
} from './player-fill.types';
import { PlayerFillComparisonService } from './player-fill-comparison.service';
import { PlayerFillEntriesService } from './player-fill-entries.service';
import { PlayerFillReductionsService } from './player-fill-reductions.service';
import { PlayerFillSpendCheckService } from './player-fill-spend-check.service';
import { PlayerFillStateService } from './player-fill-state.service';

const NO_REDUCTIONS: LastingReductionCounts = {
  moveReductionCount: 0,
  strengthReductionCount: 0,
  agilityReductionCount: 0,
  passingReductionCount: 0,
  armourReductionCount: 0,
};

interface Harness {
  service: PlayerFillService;
  db: MockDbResult;
  reads: MockProxy<PlayerAdvancementReadsService>;
  spendCheck: MockProxy<PlayerFillSpendCheckService>;
  validation: MockProxy<PlayerCharacteristicsValidationService>;
  playerSkills: MockProxy<PlayerSkillsService>;
  sppTotals: MockProxy<SppTotalsService>;
  loner: MockProxy<JourneymanLonerService>;
  reductions: MockProxy<PlayerFillReductionsService>;
}

/**
 * PlayerFillEntriesService and PlayerFillComparisonService are pure,
 * dependency-free decision services, passed real (CLAUDE.md, Testing
 * services); every other collaborator is mocked.
 */
async function makeService(
  loaded: PlayerFillState | undefined,
  resolved?: PlayerSkillEntry[],
): Promise<Harness> {
  const db = mockDb();
  const state = mock<PlayerFillStateService>();
  state.load.mockResolvedValue(loaded);
  const reads = mock<PlayerAdvancementReadsService>();
  reads.resolveFreeExtras.mockImplementation((entries) =>
    Promise.resolve(resolved ?? entries),
  );
  const spendCheck = mock<PlayerFillSpendCheckService>();
  spendCheck.problem.mockResolvedValue(undefined);
  const validation = mock<PlayerCharacteristicsValidationService>();
  const playerSkills = mock<PlayerSkillsService>();
  playerSkills.sync.mockResolvedValue({ playerSkillIds: [] });
  const sppTotals = mock<SppTotalsService>();
  sppTotals.totalsForPlayers.mockResolvedValue(new Map([[9, 5]]));
  const loner = mock<JourneymanLonerService>();
  loner.findLonerSkillIds.mockResolvedValue([80]);
  loner.ensureStartingLoner.mockResolvedValue(undefined);
  const reductions = mock<PlayerFillReductionsService>();
  reductions.derive.mockResolvedValue(NO_REDUCTIONS);
  const moduleRef = await Test.createTestingModule({
    providers: [
      PlayerFillService,
      PlayerFillEntriesService,
      PlayerFillComparisonService,
      { provide: DB, useValue: db.db },
      { provide: PlayerFillStateService, useValue: state },
      { provide: PlayerFillSpendCheckService, useValue: spendCheck },
      { provide: PlayerAdvancementReadsService, useValue: reads },
      {
        provide: PlayerCharacteristicsValidationService,
        useValue: validation,
      },
      { provide: PlayerSkillsService, useValue: playerSkills },
      { provide: SppTotalsService, useValue: sppTotals },
      { provide: JourneymanLonerService, useValue: loner },
      { provide: PlayerFillReductionsService, useValue: reductions },
    ],
  }).compile();
  return {
    service: moduleRef.get(PlayerFillService),
    db,
    reads,
    spendCheck,
    validation,
    playerSkills,
    sppTotals,
    loner,
    reductions,
  };
}

const fill: FillIncompletePlayer = {
  playerId: 9,
  status: 'active',
  characteristics: { move: 6, strength: 3, agility: 3, passing: 4, armour: 9 },
  sppTotal: 8,
  unspentSpp: 2,
  startingSkills: [{ skillId: 70, attributeValue: null }],
  advancements: [
    {
      kind: 'skill',
      skillId: 71,
      attributeValue: null,
      source: 'chosen',
      isFreeExtra: false,
    },
  ],
};

function incomplete(overrides: Partial<PlayerFillState> = {}): PlayerFillState {
  return {
    playerId: 9,
    isStarPlayer: false,
    isJourneyman: false,
    isBigGuyPosition: false,
    tpExternalId: { externalSystemId: 3, externalId: '586220' },
    positionId: 30,
    eraId: 4,
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
    reductions: NO_REDUCTIONS,
    rows: [],
    rulesSetIds: [2],
    ...overrides,
  };
}

const complete = incomplete({
  incomplete: false,
  fields: {
    move: 6,
    strength: 3,
    agility: 3,
    passing: 4,
    armour: 9,
    sppTotal: 8,
    sppAdjustment: 3,
    unspentSpp: 2,
    status: 'active',
  },
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
      skillId: 71,
      characteristic: null,
      attributeValue: null,
      source: 'chosen',
      isFreeExtra: false,
      advancementOrder: 1,
      orderConfirmed: true,
    },
  ],
});

const journeymanFill: FillIncompletePlayer = { ...fill, journeyman: true };

const startingLoner = {
  skillId: 80,
  characteristic: null,
  attributeValue: null,
  source: 'starting' as const,
  isFreeExtra: false,
  advancementOrder: null,
  orderConfirmed: false,
};

describe('PlayerFillService', () => {
  it('refuses a player that does not exist', async () => {
    const { service, db } = await makeService(undefined);

    await expect(service.fill(fill)).rejects.toThrow(
      new IncompletePlayerFillError('Player 9 does not exist'),
    );

    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('refuses a player who is not a TP player', async () => {
    const { service, db } = await makeService(
      incomplete({ tpExternalId: undefined }),
    );

    await expect(service.fill(fill)).rejects.toThrow(
      new IncompletePlayerFillError('Player 9 is not a TP player'),
    );

    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('refuses a star player', async () => {
    const { service, db } = await makeService(
      incomplete({ isStarPlayer: true }),
    );

    await expect(service.fill(fill)).rejects.toThrow(
      new IncompletePlayerFillError('Player 9 is a star player'),
    );

    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('leaves a complete player stored exactly as the entry unchanged, writing nothing', async () => {
    const { service, db, playerSkills, spendCheck, reductions } =
      await makeService(complete);

    await expect(service.fill(fill)).resolves.toEqual({
      playerId: 9,
      outcome: 'unchanged',
    });
    expect(db.transaction).not.toHaveBeenCalled();
    expect(playerSkills.sync).not.toHaveBeenCalled();
    expect(spendCheck.problem).not.toHaveBeenCalled();
    expect(reductions.derive).not.toHaveBeenCalled();
  });

  it('refuses a complete player whose data differs, writing nothing', async () => {
    const { service, db } = await makeService(complete);

    await expect(service.fill({ ...fill, status: 'dead' })).rejects.toThrow(
      new IncompletePlayerFillError(
        'Player 9 already has complete data that differs from the entry: stored status active, the entry says dead',
      ),
    );
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('refuses a complete player whose rows differ even with no contradiction', async () => {
    const { service, db } = await makeService({ ...complete, rows: [] });

    await expect(service.fill(fill)).rejects.toThrow(
      new IncompletePlayerFillError(
        'Player 9 already has complete data that differs from the entry',
      ),
    );

    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('refuses an entry that contradicts stored data, writing nothing', async () => {
    const { service, db } = await makeService(
      incomplete({ fields: { ...incomplete().fields, move: 5 } }),
    );

    await expect(service.fill(fill)).rejects.toThrow(
      new IncompletePlayerFillError(
        'Player 9: the entry contradicts stored data: stored MA 5, the entry says 6',
      ),
    );
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('validates the characteristics against the era rules set with his TP id', async () => {
    const { service, validation } = await makeService(incomplete());

    await service.fill(fill);

    expect(validation.validate).toHaveBeenCalledWith({
      externalIds: [{ externalSystemId: 3, externalId: '586220' }],
      rulesSetId: 2,
      move: 6,
      strength: 3,
      agility: 3,
      passing: 4,
      armour: 9,
    });
  });

  it('accepts characteristics one rules set of the era allows', async () => {
    const { service, validation, db } = await makeService(
      incomplete({ rulesSetIds: [2, 5] }),
    );
    validation.validate.mockRejectedValueOnce(
      new CharacteristicFormatMismatchError('Rules set 2 has no Passing'),
    );

    await expect(service.fill(fill)).resolves.toEqual({
      playerId: 9,
      outcome: 'filled',
    });
    expect(validation.validate).toHaveBeenCalledTimes(2);
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });

  it('refuses a PA no rules set of the era allows, required or forbidden', async () => {
    const { service, validation, db } = await makeService(incomplete());
    validation.validate.mockRejectedValue(
      new CharacteristicFormatMismatchError(
        'Rules set 2 has no Passing characteristic, but player 3:586220 supplies one',
      ),
    );

    await expect(service.fill(fill)).rejects.toThrow(
      CharacteristicFormatMismatchError,
    );
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('rethrows an unexpected validation failure', async () => {
    const { service, validation, db } = await makeService(incomplete());
    validation.validate.mockRejectedValue(new Error('db down'));

    await expect(service.fill(fill)).rejects.toThrow('db down');

    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('refuses a player whose era has no rules set', async () => {
    const { service, db } = await makeService(incomplete({ rulesSetIds: [] }));

    await expect(service.fill(fill)).rejects.toThrow(
      new IncompletePlayerFillError(
        "Player 9's era has no rules set to check the characteristics against",
      ),
    );

    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('refuses advancements the reported spend does not allow, writing nothing', async () => {
    const { service, spendCheck, db } = await makeService(incomplete());
    spendCheck.problem.mockResolvedValue(
      ": this order cannot cost exactly the 6 SPP reported as spent under any rules set of the player's era",
    );

    await expect(service.fill(fill)).rejects.toThrow(
      new IncompletePlayerFillError(
        "Player 9: this order cannot cost exactly the 6 SPP reported as spent under any rules set of the player's era",
      ),
    );
    expect(spendCheck.problem).toHaveBeenCalledWith({
      playerId: 9,
      planned: [
        expect.objectContaining({ skillId: 70, paidNumber: null }),
        expect.objectContaining({ skillId: 71, paidNumber: 1 }),
      ],
      sppTotal: 8,
      unspentSpp: 2,
    });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('plans the spend check from the entries after free-extra resolution', async () => {
    const twoSkills: FillIncompletePlayer = {
      ...fill,
      advancements: [
        {
          kind: 'skill',
          skillId: 71,
          attributeValue: null,
          source: 'chosen',
          isFreeExtra: false,
        },
        {
          kind: 'skill',
          skillId: 72,
          attributeValue: null,
          source: 'chosen',
          isFreeExtra: false,
        },
      ],
    };
    const raw: PlayerSkillEntry[] = [
      {
        playerId: 9,
        skillId: 70,
        source: 'starting',
        attributeValue: null,
      },
      {
        playerId: 9,
        skillId: 71,
        source: 'chosen',
        attributeValue: null,
        isFreeExtra: false,
        advancementOrder: 1,
        orderConfirmed: true,
      },
      {
        playerId: 9,
        skillId: 72,
        source: 'chosen',
        attributeValue: null,
        isFreeExtra: false,
        advancementOrder: 2,
        orderConfirmed: true,
      },
    ];
    const resolved = raw.map((entry) =>
      entry.skillId === 71 ? { ...entry, isFreeExtra: true } : entry,
    );
    const { service, reads, spendCheck } = await makeService(
      incomplete(),
      resolved,
    );

    await service.fill(twoSkills);

    expect(reads.resolveFreeExtras).toHaveBeenCalledWith(raw);
    expect(spendCheck.problem).toHaveBeenCalledWith({
      playerId: 9,
      planned: [
        expect.objectContaining({ skillId: 70, paidNumber: null }),
        expect.objectContaining({
          skillId: 71,
          isFreeExtra: true,
          paidNumber: null,
        }),
        expect.objectContaining({ skillId: 72, paidNumber: 1 }),
      ],
      sppTotal: 8,
      unspentSpp: 2,
    });
  });

  it('writes the rows and the fields in one transaction, computing the SPP adjustment', async () => {
    const { service, db, playerSkills } = await makeService(incomplete());

    await expect(service.fill(fill)).resolves.toEqual({
      playerId: 9,
      outcome: 'filled',
    });

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(playerSkills.sync).toHaveBeenCalledWith(
      {
        entries: [
          {
            playerId: 9,
            skillId: 70,
            source: 'starting',
            attributeValue: null,
          },
          {
            playerId: 9,
            skillId: 71,
            source: 'chosen',
            attributeValue: null,
            isFreeExtra: false,
            advancementOrder: 1,
            orderConfirmed: true,
          },
        ],
        characteristicPlayerIds: [9],
      },
      { keepUnspentSpp: true, tx: db.db },
    );
    expect(db.db.update).toHaveBeenCalledWith(players);
    expect(db.chains[0].set).toHaveBeenCalledWith({
      move: 6,
      strength: 3,
      agility: 3,
      passing: 4,
      armour: 9,
      sppTotal: 8,
      unspentSpp: 2,
      status: 'active',
      sppAdjustment: 3,
      moveReductionCount: 0,
      strengthReductionCount: 0,
      agilityReductionCount: 0,
      passingReductionCount: 0,
      armourReductionCount: 0,
    });
  });

  it('clamps the SPP adjustment at 0', async () => {
    const { service, db, sppTotals } = await makeService(incomplete());
    sppTotals.totalsForPlayers.mockResolvedValue(new Map([[9, 12]]));

    await service.fill(fill);

    expect(db.chains[0].set).toHaveBeenCalledWith(
      expect.objectContaining({ sppAdjustment: 0 }),
    );
  });

  it('keeps a stored SPP adjustment instead of computing one', async () => {
    const { service, db, sppTotals } = await makeService(
      incomplete({ fields: { ...incomplete().fields, sppAdjustment: 1 } }),
    );

    await service.fill(fill);

    expect(sppTotals.totalsForPlayers).not.toHaveBeenCalled();
    expect(db.chains[0].set).toHaveBeenCalledWith(
      expect.objectContaining({ sppAdjustment: 1 }),
    );
  });

  it('records the lasting reductions derived from the entry line and its increases', async () => {
    const { service, db, reductions } = await makeService(incomplete());
    reductions.derive.mockResolvedValue({
      ...NO_REDUCTIONS,
      armourReductionCount: 1,
    });
    const withIncrease: FillIncompletePlayer = {
      ...fill,
      advancements: [
        ...fill.advancements,
        { kind: 'characteristic', characteristic: 'AV' },
      ],
    };

    await service.fill(withIncrease);

    expect(reductions.derive).toHaveBeenCalledWith({
      positionId: 30,
      eraId: 4,
      line: fill.characteristics,
      increases: ['AV'],
    });
    expect(db.chains[0].set).toHaveBeenCalledWith(
      expect.objectContaining({
        moveReductionCount: 0,
        armourReductionCount: 1,
      }),
    );
  });

  it('derives no reductions for a refused entry', async () => {
    const { service, reductions } = await makeService(
      incomplete({ fields: { ...incomplete().fields, move: 5 } }),
    );

    await expect(service.fill(fill)).rejects.toThrow(IncompletePlayerFillError);
    expect(reductions.derive).not.toHaveBeenCalled();
  });
});

describe('PlayerFillService journeyman entries', () => {
  it('refuses one for a player whose marker is not set, writing nothing', async () => {
    const { service, db, loner } = await makeService(incomplete());

    await expect(service.fill(journeymanFill)).rejects.toThrow(
      new IncompletePlayerFillError('Player 9 is not marked a journeyman'),
    );
    expect(db.transaction).not.toHaveBeenCalled();
    expect(loner.ensureStartingLoner).not.toHaveBeenCalled();
  });

  it('refuses one for a Big Guy position', async () => {
    const { service, db } = await makeService(
      incomplete({ isJourneyman: true, isBigGuyPosition: true }),
    );

    await expect(service.fill(journeymanFill)).rejects.toThrow(
      new IncompletePlayerFillError('Player 9 is not in a basic position'),
    );
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('refuses one that lists Loner among the starting skills', async () => {
    const { service, db } = await makeService(
      incomplete({ isJourneyman: true }),
    );

    await expect(
      service.fill({
        ...journeymanFill,
        startingSkills: [
          { skillId: 70, attributeValue: null },
          { skillId: 80, attributeValue: '4+' },
        ],
      }),
    ).rejects.toThrow(
      new IncompletePlayerFillError(
        'Player 9 lists Loner among the starting skills of a journeyman entry',
      ),
    );
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('accepts his stored starting Loner, writes the entry and ensures the Loner in the same transaction', async () => {
    const { service, db, loner, playerSkills } = await makeService(
      incomplete({ isJourneyman: true, rows: [startingLoner] }),
    );

    await expect(service.fill(journeymanFill)).resolves.toEqual({
      playerId: 9,
      outcome: 'filled',
    });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(loner.ensureStartingLoner).toHaveBeenCalledWith(9, { tx: db.db });
    const synced = playerSkills.sync.mock.calls[0][0].entries;
    expect(synced.map((entry) => entry.skillId)).toEqual([70, 71]);
    expect(db.db.update).toHaveBeenCalledWith(players);
  });

  it('prices only the entry, not the Loner it keeps', async () => {
    const { service, spendCheck } = await makeService(
      incomplete({ isJourneyman: true, rows: [startingLoner] }),
    );

    await service.fill(journeymanFill);

    const planned = spendCheck.problem.mock.calls[0][0].planned;
    expect(planned.map((row) => row.skillId)).toEqual([70, 71]);
  });

  it('leaves a complete journeyman stored exactly as the entry unchanged', async () => {
    const { service, db, loner } = await makeService({
      ...complete,
      isJourneyman: true,
      rows: [...complete.rows, startingLoner],
    });

    await expect(service.fill(journeymanFill)).resolves.toEqual({
      playerId: 9,
      outcome: 'unchanged',
    });
    expect(db.transaction).not.toHaveBeenCalled();
    expect(loner.ensureStartingLoner).not.toHaveBeenCalled();
  });

  it('refuses a different entry for a complete journeyman', async () => {
    const { service } = await makeService({
      ...complete,
      isJourneyman: true,
      rows: [...complete.rows, startingLoner],
    });

    await expect(
      service.fill({ ...journeymanFill, sppTotal: 9, unspentSpp: 3 }),
    ).rejects.toThrow(/already has complete data that differs from the entry/);
  });

  it('neither reads nor ensures Loner for an entry without the flag', async () => {
    const { service, loner } = await makeService(incomplete());

    await service.fill(fill);

    expect(loner.findLonerSkillIds).not.toHaveBeenCalled();
    expect(loner.ensureStartingLoner).not.toHaveBeenCalled();
  });

  it('still refuses a stored starting Loner an entry without the flag leaves out', async () => {
    const { service } = await makeService(
      incomplete({ isJourneyman: true, rows: [startingLoner] }),
    );

    await expect(service.fill(fill)).rejects.toThrow(
      /starting skill 80 is stored but not in the entry/,
    );
  });
});
