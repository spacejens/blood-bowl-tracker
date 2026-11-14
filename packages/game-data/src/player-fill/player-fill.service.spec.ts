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

import { PlayerAdvancementReadsService } from '../player-skills/player-advancement-reads.service';
import { PlayerSkillsService } from '../player-skills/player-skills.service';
import { PlayerCharacteristicsValidationService } from '../players/player-characteristics-validation.service';
import { CharacteristicFormatMismatchError } from '../shared/characteristic-format-mismatch-error';
import { IncompletePlayerFillError } from '../shared/incomplete-player-fill-error';
import { SppTotalsService } from '../spp/spp-totals.service';
import { PlayerFillService } from './player-fill.service';
import type { PlayerFillState } from './player-fill.types';
import { PlayerFillComparisonService } from './player-fill-comparison.service';
import { PlayerFillEntriesService } from './player-fill-entries.service';
import { PlayerFillSpendCheckService } from './player-fill-spend-check.service';
import { PlayerFillStateService } from './player-fill-state.service';

interface Harness {
  service: PlayerFillService;
  db: MockDbResult;
  reads: MockProxy<PlayerAdvancementReadsService>;
  spendCheck: MockProxy<PlayerFillSpendCheckService>;
  validation: MockProxy<PlayerCharacteristicsValidationService>;
  playerSkills: MockProxy<PlayerSkillsService>;
  sppTotals: MockProxy<SppTotalsService>;
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
    tpExternalId: { externalSystemId: 3, externalId: '586220' },
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
    const { service, db, playerSkills, spendCheck } =
      await makeService(complete);

    await expect(service.fill(fill)).resolves.toEqual({
      playerId: 9,
      outcome: 'unchanged',
    });
    expect(db.transaction).not.toHaveBeenCalled();
    expect(playerSkills.sync).not.toHaveBeenCalled();
    expect(spendCheck.problem).not.toHaveBeenCalled();
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
});
