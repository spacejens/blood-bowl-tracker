import type { ImportError } from '@blood-bowl-tracker/api-contract';
import type { Player } from '@blood-bowl-tracker/db';
import { PlayersService } from '@blood-bowl-tracker/game-data';
import {
  ImportResultService,
  UpsertRecorderService,
} from '@blood-bowl-tracker/import-shared';
import type { TpRosterPlayer } from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import {
  rosterContext,
  rosterPlayer,
  RULES_SET,
  TP_SYSTEM_ID,
  tpRoster,
} from '../tp-roster.test-helpers';
import { TpCharacteristicIncreasesService } from './tp-characteristic-increases.service';
import { TpLastingInjuryBuilderService } from './tp-lasting-injury-builder.service';
import type { MercenaryCurated } from './tp-mercenary-characteristics.service';
import { TpMercenaryCharacteristicsService } from './tp-mercenary-characteristics.service';
import { TpPlayerCharacteristicsBuilderService } from './tp-player-characteristics-builder.service';
import { TpPlayerPositionService } from './tp-player-position.service';
import { TpPlayerStatusService } from './tp-player-status.service';
import { TpRosterPlayersImportService } from './tp-roster-players-import.service';

const TEAM_ERA_ID = 31;

interface Mocks {
  positions: MockProxy<TpPlayerPositionService>;
  players: MockProxy<PlayersService>;
  mercenaryCharacteristics: MockProxy<TpMercenaryCharacteristicsService>;
  lastingInjuries: MockProxy<TpLastingInjuryBuilderService>;
  increases: MockProxy<TpCharacteristicIncreasesService>;
  status: MockProxy<TpPlayerStatusService>;
}

describe('TpRosterPlayersImportService', () => {
  let mocks: Mocks;
  let errors: ImportError[];

  beforeEach(() => {
    errors = [];
  });

  /**
   * Builds the subject with every player resolving to position 11 and every
   * upsert inserting player `700 + n`, unless a test overrides a mock first.
   */
  async function makeService(
    configure: (m: Mocks) => void = () => undefined,
  ): Promise<TpRosterPlayersImportService> {
    mocks = {
      positions: mock<TpPlayerPositionService>(),
      players: mock<PlayersService>(),
      mercenaryCharacteristics: mock<TpMercenaryCharacteristicsService>(),
      lastingInjuries: mock<TpLastingInjuryBuilderService>(),
      increases: mock<TpCharacteristicIncreasesService>(),
      status: mock<TpPlayerStatusService>(),
    };
    mocks.positions.resolveCatalogPositions.mockResolvedValue(
      new Map([[77, 11]]),
    );
    mocks.positions.forPlayer.mockResolvedValue({
      positionId: 11,
      mercenary: undefined,
    });
    let nextId = 700;
    mocks.players.upsert.mockImplementation(() =>
      Promise.resolve({
        player: mock<Player>({ id: nextId++ }),
        created: true,
      }),
    );
    mocks.increases.newCache.mockReturnValue({
      baselinesByPositionId: new Map(),
      reportedGaps: new Set(),
    });
    mocks.status.forPlayer.mockReturnValue(null);
    configure(mocks);
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpRosterPlayersImportService,
        TpPlayerCharacteristicsBuilderService,
        ImportResultService,
        UpsertRecorderService,
        { provide: TpPlayerPositionService, useValue: mocks.positions },
        { provide: PlayersService, useValue: mocks.players },
        {
          provide: TpMercenaryCharacteristicsService,
          useValue: mocks.mercenaryCharacteristics,
        },
        {
          provide: TpLastingInjuryBuilderService,
          useValue: mocks.lastingInjuries,
        },
        {
          provide: TpCharacteristicIncreasesService,
          useValue: mocks.increases,
        },
        { provide: TpPlayerStatusService, useValue: mocks.status },
      ],
    }).compile();
    return moduleRef.get(TpRosterPlayersImportService);
  }

  const run = (
    service: TpRosterPlayersImportService,
    options: {
      players?: TpRosterPlayer[];
      embedded?: TpRosterPlayer[];
      context?: ReturnType<typeof rosterContext>;
      deferSppTotal?: boolean;
    } = {},
  ) =>
    service.importPlayers({
      roster: tpRoster({ players: options.players ?? [rosterPlayer()] }),
      matchEmbeddedPlayers: options.embedded ?? [],
      context: options.context ?? rosterContext(),
      teamEraId: TEAM_ERA_ID,
      deferSppTotal: options.deferSppTotal,
      errors,
    });

  it('imports a resolvable roster player and reports its lineUpId and DB id', async () => {
    const service = await makeService();

    const outcome = await run(service);

    expect(mocks.players.upsert).toHaveBeenCalledWith({
      name: 'Grim',
      teamEraId: TEAM_ERA_ID,
      positionId: 11,
      sppTotal: 12,
      status: null,
      externalIds: [{ externalSystemId: TP_SYSTEM_ID, externalId: '5001' }],
    });
    expect(outcome).toEqual({
      imported: 1,
      importedPlayers: [
        { lineUpId: 5001, playerId: 700, created: true, reportedSppTotal: 12 },
      ],
      mercenaryPositionUsages: [],
    });
    expect(errors).toEqual([]);
  });

  it('imports a player present only in a match snapshot', async () => {
    const service = await makeService();
    const departed = rosterPlayer({ id: 5009, name: 'Gone' });

    const outcome = await run(service, { embedded: [departed] });

    expect(outcome.importedPlayers.map((p) => p.lineUpId)).toEqual([
      5009, 5001,
    ]);
  });

  it("prefers the roster file's data over a match snapshot's for the same id", async () => {
    const service = await makeService();

    await run(service, {
      players: [rosterPlayer({ name: 'Fresh' })],
      embedded: [rosterPlayer({ name: 'Stale' })],
    });

    expect(mocks.players.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.players.upsert.mock.calls[0][0].name).toBe('Fresh');
  });

  it('uses the MAXIMUM totalStarPlayerPoints across the roster file and match snapshots', async () => {
    const service = await makeService();

    await run(service, {
      players: [rosterPlayer({ totalStarPlayerPoints: 12 })],
      embedded: [rosterPlayer({ totalStarPlayerPoints: 20 })],
    });

    expect(mocks.players.upsert.mock.calls[0][0].sppTotal).toBe(20);
  });

  it('reports the highest total as the reported total', async () => {
    const service = await makeService();

    const outcome = await run(service, {
      players: [rosterPlayer({ totalStarPlayerPoints: 12 })],
      embedded: [rosterPlayer({ totalStarPlayerPoints: 20 })],
    });

    expect(outcome.importedPlayers[0].reportedSppTotal).toBe(20);
  });

  it("reports the roster file's own unspent snapshot, not the higher match total", async () => {
    const service = await makeService();

    const outcome = await run(service, {
      players: [
        rosterPlayer({ totalStarPlayerPoints: 12, starPlayerPoints: 4 }),
      ],
      embedded: [rosterPlayer({ totalStarPlayerPoints: 20 })],
    });

    expect(outcome.importedPlayers[0]).toMatchObject({
      reportedSppTotal: 20,
      unspentSppSnapshot: { unspentSpp: 4, snapshotSppTotal: 12 },
    });
  });

  it("reports a match-only player's unspent snapshot from that entry's own total", async () => {
    const service = await makeService();

    const outcome = await run(service, {
      players: [rosterPlayer({ id: 5001 })],
      embedded: [
        rosterPlayer({
          id: 5002,
          totalStarPlayerPoints: 31,
          starPlayerPoints: 9,
        }),
      ],
    });

    expect(
      outcome.importedPlayers.find((p) => p.lineUpId === 5002),
    ).toMatchObject({
      unspentSppSnapshot: { unspentSpp: 9, snapshotSppTotal: 31 },
    });
  });

  it('pairs the unspent figure with the total of the same match entry', async () => {
    const service = await makeService();

    const outcome = await run(service, {
      players: [],
      embedded: [
        rosterPlayer({
          id: 5002,
          totalStarPlayerPoints: 31,
          starPlayerPoints: 9,
        }),
        rosterPlayer({
          id: 5002,
          totalStarPlayerPoints: 40,
          starPlayerPoints: 2,
        }),
        rosterPlayer({ id: 5002, totalStarPlayerPoints: 45 }),
      ],
    });

    expect(outcome.importedPlayers).toHaveLength(1);
    expect(outcome.importedPlayers[0]).toMatchObject({
      reportedSppTotal: 45,
      unspentSppSnapshot: { unspentSpp: 2, snapshotSppTotal: 40 },
    });
  });

  it('prefers the lower unspent figure at equal match totals, in either order', async () => {
    const entries = [
      rosterPlayer({
        id: 5002,
        totalStarPlayerPoints: 20,
        starPlayerPoints: 6,
      }),
      rosterPlayer({
        id: 5002,
        totalStarPlayerPoints: 20,
        starPlayerPoints: 0,
      }),
    ];

    for (const embedded of [entries, [...entries].reverse()]) {
      const service = await makeService();
      const outcome = await run(service, { players: [], embedded });

      expect(outcome.importedPlayers[0].unspentSppSnapshot).toEqual({
        unspentSpp: 0,
        snapshotSppTotal: 20,
      });
    }
  });

  it('lets the later match entry win when total and unspent figure are equal', async () => {
    const service = await makeService();

    const outcome = await run(service, {
      players: [],
      embedded: [
        rosterPlayer({
          id: 5002,
          totalStarPlayerPoints: 20,
          starPlayerPoints: 3,
        }),
        rosterPlayer({
          id: 5002,
          totalStarPlayerPoints: 20,
          starPlayerPoints: 3,
        }),
      ],
    });

    expect(outcome.importedPlayers[0].unspentSppSnapshot).toEqual({
      unspentSpp: 3,
      snapshotSppTotal: 20,
    });
  });

  it('keeps the higher-total match entry even with a higher unspent figure', async () => {
    const entries = [
      rosterPlayer({
        id: 5002,
        totalStarPlayerPoints: 20,
        starPlayerPoints: 0,
      }),
      rosterPlayer({
        id: 5002,
        totalStarPlayerPoints: 24,
        starPlayerPoints: 8,
      }),
    ];

    for (const embedded of [entries, [...entries].reverse()]) {
      const service = await makeService();
      const outcome = await run(service, { players: [], embedded });

      expect(outcome.importedPlayers[0].unspentSppSnapshot).toEqual({
        unspentSpp: 8,
        snapshotSppTotal: 24,
      });
    }
  });

  it('prefers the roster entry over a match entry for a player the roster lists', async () => {
    const service = await makeService();

    const outcome = await run(service, {
      players: [rosterPlayer({ totalStarPlayerPoints: 12 })],
      embedded: [
        rosterPlayer({ totalStarPlayerPoints: 20, starPlayerPoints: 7 }),
      ],
    });

    expect(outcome.importedPlayers[0].unspentSppSnapshot).toBeUndefined();
  });

  it('reports no unspent snapshot without starPlayerPoints or a roster entry', async () => {
    const service = await makeService();

    const outcome = await run(service, {
      players: [rosterPlayer()],
      embedded: [rosterPlayer({ id: 5002 })],
    });

    expect(outcome.importedPlayers.map((p) => p.unspentSppSnapshot)).toEqual([
      undefined,
      undefined,
    ]);
  });

  it('sends no sppTotal when the caller defers it, but still reports it', async () => {
    const service = await makeService();

    const outcome = await run(service, { deferSppTotal: true });

    expect(mocks.players.upsert.mock.calls[0][0]).not.toHaveProperty(
      'sppTotal',
    );
    expect(outcome.importedPlayers[0].reportedSppTotal).toBe(12);
  });

  it('sends the raw total when the caller does not defer it', async () => {
    const service = await makeService();

    await run(service, { deferSppTotal: false });

    expect(mocks.players.upsert.mock.calls[0][0].sppTotal).toBe(12);
  });

  it('skips a player whose position does not resolve (error recorded by the position service)', async () => {
    const service = await makeService((m) => {
      m.positions.forPlayer.mockResolvedValue(undefined);
    });

    const outcome = await run(service);

    expect(mocks.players.upsert).not.toHaveBeenCalled();
    expect(outcome.imported).toBe(0);
  });

  it("sends a roster player's own characteristics with the era's rules set", async () => {
    const service = await makeService();
    const characteristics = {
      move: 6,
      strength: 3,
      agility: 3,
      passing: 4,
      armour: 9,
    };

    await run(service, { players: [rosterPlayer({ characteristics })] });

    expect(mocks.players.upsert.mock.calls[0][0]).toMatchObject({
      ...characteristics,
      rulesSetId: RULES_SET.id,
    });
  });

  it('emits a mercenaryPositionUsage for a mercenary hire', async () => {
    const curated: MercenaryCurated = { loaded: false };
    const service = await makeService((m) => {
      m.positions.forPlayer.mockResolvedValue({
        positionId: 55,
        mercenary: curated,
      });
    });

    const outcome = await run(service);

    expect(outcome.mercenaryPositionUsages).toEqual([
      { positionId: 55, teamRaceCode: 'orc', era: 'Fourth era' },
    ]);
  });

  it('records the upsert failure naming the player', async () => {
    const service = await makeService((m) => {
      m.players.upsert.mockRejectedValue(new Error('bad characteristics'));
    });

    const outcome = await run(service);

    expect(outcome.imported).toBe(0);
    expect(errors.map((e) => e.message)).toEqual([
      'Failed to import player "Grim": bad characteristics',
    ]);
  });

  it('creates one mercenary cache and one increase cache per import', async () => {
    const service = await makeService();

    await run(service, {
      players: [rosterPlayer({ id: 1 }), rosterPlayer({ id: 2 })],
    });

    expect(mocks.increases.newCache).toHaveBeenCalledTimes(1);
    const caches = mocks.positions.forPlayer.mock.calls.map(
      ([options]) => options.mercenaryCache,
    );
    expect(caches[0]).toBe(caches[1]);
  });

  it("resolves each player's position by its TP position id", async () => {
    const service = await makeService();

    await run(service, {
      players: [rosterPlayer({ id: 1, lineUpMasterId: 77 })],
    });

    expect(mocks.positions.resolveCatalogPositions).toHaveBeenCalledWith({
      players: [rosterPlayer({ id: 1, lineUpMasterId: 77 })],
      tpSystemId: TP_SYSTEM_ID,
    });
    expect(mocks.positions.forPlayer).toHaveBeenCalledWith(
      expect.objectContaining({
        catalogPositionIds: new Map([[77, 11]]),
      }),
    );
  });

  it('imports an embedded star player from a standalone roster with no special casing', async () => {
    const service = await makeService((m) => {
      m.positions.forPlayer.mockResolvedValue({
        positionId: 700,
        mercenary: undefined,
      });
    });

    await run(service);

    expect(mocks.players.upsert.mock.calls[0][0].positionId).toBe(700);
  });

  it('imports a star player present only in a match-embedded snapshot with no special casing', async () => {
    const service = await makeService((m) => {
      m.positions.forPlayer.mockResolvedValue({
        positionId: 700,
        mercenary: undefined,
      });
    });
    const embedded = rosterPlayer({ id: 5009, name: 'Star' });

    await run(service, { players: [], embedded: [embedded] });

    expect(mocks.players.upsert.mock.calls[0][0].positionId).toBe(700);
  });

  it('emits one mercenaryPositionUsage per hire, sharing the same position id', async () => {
    const curated: MercenaryCurated = { loaded: false };
    const service = await makeService((m) => {
      m.positions.forPlayer.mockResolvedValue({
        positionId: 55,
        mercenary: curated,
      });
    });

    const outcome = await run(service, {
      players: [rosterPlayer({ id: 1 }), rosterPlayer({ id: 2 })],
    });

    expect(outcome.mercenaryPositionUsages).toEqual([
      { positionId: 55, teamRaceCode: 'orc', era: 'Fourth era' },
      { positionId: 55, teamRaceCode: 'orc', era: 'Fourth era' },
    ]);
  });

  it('emits no mercenaryPositionUsage for a regular (non-mercenary) roster player', async () => {
    const service = await makeService();

    const outcome = await run(service);

    expect(outcome.mercenaryPositionUsages).toEqual([]);
  });

  describe('characteristics', () => {
    it('treats a star-position player no differently: its own values are sent', async () => {
      const service = await makeService((m) => {
        m.positions.forPlayer.mockResolvedValue({
          positionId: 700,
          mercenary: undefined,
        });
      });
      const characteristics = {
        move: 7,
        strength: 5,
        agility: 2,
        passing: 4,
        armour: 11,
      };

      await run(service, { players: [rosterPlayer({ characteristics })] });

      expect(mocks.players.upsert.mock.calls[0][0]).toMatchObject({
        ...characteristics,
        rulesSetId: RULES_SET.id,
      });
    });

    it('sends no characteristics for a player carrying none', async () => {
      const service = await makeService();

      await run(service);

      const payload = mocks.players.upsert.mock.calls[0][0];
      expect(payload).not.toHaveProperty('move');
      expect(payload).not.toHaveProperty('rulesSetId');
    });

    it('sends no characteristics when the era resolved to no rules set', async () => {
      const service = await makeService();
      const characteristics = {
        move: 6,
        strength: 3,
        agility: 3,
        passing: 4,
        armour: 9,
      };

      await run(service, {
        players: [rosterPlayer({ characteristics })],
        context: rosterContext({ rulesSet: undefined }),
      });

      const payload = mocks.players.upsert.mock.calls[0][0];
      expect(payload).not.toHaveProperty('move');
      expect(payload).not.toHaveProperty('rulesSetId');
      expect(mocks.increases.forPlayer).not.toHaveBeenCalled();
    });

    it('does not reach for the mercenary fallback for a non-mercenary player', async () => {
      const service = await makeService();

      await run(service);

      expect(
        mocks.mercenaryCharacteristics.forRosterPlayer,
      ).not.toHaveBeenCalled();
    });
  });

  describe('characteristic-increase counts', () => {
    const characteristics = {
      move: 6,
      strength: 3,
      agility: 3,
      passing: 4,
      armour: 9,
    };

    it('sends the derived characteristic-increase counts', async () => {
      const service = await makeService((m) => {
        m.increases.forPlayer.mockResolvedValue({
          moveIncreaseCount: 1,
          strengthIncreaseCount: 0,
          agilityIncreaseCount: 1,
          passingIncreaseCount: 0,
          armourIncreaseCount: 0,
        });
      });

      await run(service, { players: [rosterPlayer({ characteristics })] });

      expect(mocks.players.upsert.mock.calls[0][0]).toMatchObject({
        moveIncreaseCount: 1,
        agilityIncreaseCount: 1,
      });
    });

    it("measures against the player's own resolved rules set", async () => {
      const service = await makeService();

      await run(service, { players: [rosterPlayer({ characteristics })] });

      expect(mocks.increases.forPlayer).toHaveBeenCalledWith(
        expect.objectContaining({ rulesSet: RULES_SET }),
      );
    });

    it('passes the derived reduction counts through', async () => {
      const reductions = {
        missNextGame: false,
        nigglingInjuryCount: 0,
        moveReductionCount: 0,
        strengthReductionCount: 0,
        agilityReductionCount: 0,
        passingReductionCount: 0,
        armourReductionCount: 1,
      };
      const service = await makeService((m) => {
        m.lastingInjuries.forRosterPlayer.mockReturnValue(reductions);
      });

      await run(service, { players: [rosterPlayer({ characteristics })] });

      expect(mocks.increases.forPlayer).toHaveBeenCalledWith(
        expect.objectContaining({ reductions }),
      );
    });

    it('sends no increase group for a player with no characteristics', async () => {
      const service = await makeService();

      await run(service);

      expect(mocks.increases.forPlayer).not.toHaveBeenCalled();
    });

    it('sends no increase group when there is no single rules set', async () => {
      const service = await makeService();

      await run(service, {
        players: [rosterPlayer({ characteristics })],
        context: rosterContext({ rulesSet: undefined }),
      });

      expect(mocks.increases.forPlayer).not.toHaveBeenCalled();
    });

    it('sends no increase group when no baseline could be resolved', async () => {
      const service = await makeService((m) => {
        m.increases.forPlayer.mockResolvedValue(undefined);
      });

      await run(service, { players: [rosterPlayer({ characteristics })] });

      const payload = mocks.players.upsert.mock.calls[0][0];
      expect(payload).not.toHaveProperty('moveIncreaseCount');
    });

    it('passes the embedded position template as the baseline', async () => {
      const positionTemplate = {
        move: 5,
        strength: 4,
        agility: 3,
        passing: 6,
        armour: 8,
      };
      const service = await makeService();

      await run(service, {
        players: [rosterPlayer({ characteristics, positionTemplate })],
      });

      expect(mocks.increases.forPlayer).toHaveBeenCalledWith(
        expect.objectContaining({ baseline: positionTemplate }),
      );
    });

    it('falls back to no baseline override when there is no template', async () => {
      const service = await makeService();

      await run(service, { players: [rosterPlayer({ characteristics })] });

      expect(mocks.increases.forPlayer).toHaveBeenCalledWith(
        expect.objectContaining({ baseline: undefined }),
      );
    });

    it('converts the literal-0 passing to null when the rules set declares no Passing', async () => {
      const positionTemplate = {
        move: 5,
        strength: 4,
        agility: 3,
        passing: 0,
        armour: 8,
      };
      const service = await makeService();

      await run(service, {
        players: [rosterPlayer({ characteristics, positionTemplate })],
        context: rosterContext({
          rulesSet: { ...RULES_SET, passingFormat: 'absent' },
        }),
      });

      expect(mocks.increases.forPlayer).toHaveBeenCalledWith(
        expect.objectContaining({
          baseline: { ...positionTemplate, passing: null },
        }),
      );
    });
  });

  describe('lasting injuries', () => {
    it("sends a roster player's live lasting-injury state", async () => {
      const injuries = {
        missNextGame: true,
        nigglingInjuryCount: 2,
        moveReductionCount: 0,
        strengthReductionCount: 0,
        agilityReductionCount: 0,
        passingReductionCount: 0,
        armourReductionCount: 0,
      };
      const service = await makeService((m) => {
        m.lastingInjuries.forRosterPlayer.mockReturnValue(injuries);
      });

      await run(service);

      expect(mocks.lastingInjuries.forRosterPlayer).toHaveBeenCalledWith({
        player: rosterPlayer(),
        rulesSet: RULES_SET,
      });
      expect(mocks.players.upsert.mock.calls[0][0]).toMatchObject(injuries);
    });

    it('detects a stat reduction', async () => {
      const injuries = {
        missNextGame: false,
        nigglingInjuryCount: 0,
        moveReductionCount: 0,
        strengthReductionCount: 0,
        agilityReductionCount: 0,
        passingReductionCount: 0,
        armourReductionCount: 1,
      };
      const service = await makeService((m) => {
        m.lastingInjuries.forRosterPlayer.mockReturnValue(injuries);
      });

      await run(service);

      expect(mocks.players.upsert.mock.calls[0][0]).toMatchObject({
        armourReductionCount: 1,
      });
    });

    it('sends no lasting-injury fields for a player carrying no live state', async () => {
      const service = await makeService((m) => {
        m.lastingInjuries.forRosterPlayer.mockReturnValue(undefined);
      });

      await run(service);

      const payload = mocks.players.upsert.mock.calls[0][0];
      expect(payload).not.toHaveProperty('missNextGame');
      expect(payload).not.toHaveProperty('nigglingInjuryCount');
    });

    it('reports only the players this run inserted', async () => {
      const service = await makeService((m) => {
        m.players.upsert.mockResolvedValue({
          player: mock<Player>({ id: 900 }),
          created: false,
        });
      });

      const outcome = await run(service);

      expect(outcome.importedPlayers).toEqual([
        { lineUpId: 5001, playerId: 900, created: false, reportedSppTotal: 12 },
      ]);
    });

    it('reports a freshly inserted player', async () => {
      const service = await makeService((m) => {
        m.players.upsert.mockResolvedValue({
          player: mock<Player>({ id: 900 }),
          created: true,
        });
      });

      const outcome = await run(service);

      expect(outcome.importedPlayers).toEqual([
        { lineUpId: 5001, playerId: 900, created: true, reportedSppTotal: 12 },
      ]);
    });
  });

  describe('mercenary characteristics', () => {
    it("sends a mercenary hire the curated characteristics for its era's rules set", async () => {
      const curated: MercenaryCurated = { loaded: false };
      const characteristics = {
        move: 6,
        strength: 7,
        agility: 5,
        passing: 5,
        armour: 11,
        rulesSetId: RULES_SET.id,
      };
      const service = await makeService((m) => {
        m.positions.forPlayer.mockResolvedValue({
          positionId: 55,
          mercenary: curated,
        });
        m.mercenaryCharacteristics.forRosterPlayer.mockReturnValue(
          characteristics,
        );
      });
      const player = rosterPlayer({ characteristics: undefined });

      await run(service, { players: [player] });

      expect(
        mocks.mercenaryCharacteristics.forRosterPlayer,
      ).toHaveBeenCalledWith({
        curated,
        positionName: player.fallbackPositionName,
        player: { id: player.id, name: player.name },
        rulesSet: { id: RULES_SET.id, name: RULES_SET.name },
        errors,
      });
      expect(mocks.players.upsert.mock.calls[0][0]).toMatchObject(
        characteristics,
      );
    });

    it('imports a mercenary hire without characteristics when the curated table has no entry', async () => {
      const curated: MercenaryCurated = { loaded: false };
      const service = await makeService((m) => {
        m.positions.forPlayer.mockResolvedValue({
          positionId: 55,
          mercenary: curated,
        });
        m.mercenaryCharacteristics.forRosterPlayer.mockReturnValue(undefined);
      });

      await run(service, {
        players: [rosterPlayer({ characteristics: undefined })],
      });

      const payload = mocks.players.upsert.mock.calls[0][0];
      expect(payload).not.toHaveProperty('move');
    });

    it("prefers a mercenary hire's own embedded characteristics over the curated fallback", async () => {
      const curated: MercenaryCurated = { loaded: false };
      const characteristics = {
        move: 5,
        strength: 6,
        agility: 4,
        passing: 4,
        armour: 10,
      };
      const service = await makeService((m) => {
        m.positions.forPlayer.mockResolvedValue({
          positionId: 55,
          mercenary: curated,
        });
      });

      await run(service, {
        players: [rosterPlayer({ characteristics })],
      });

      expect(
        mocks.mercenaryCharacteristics.forRosterPlayer,
      ).not.toHaveBeenCalled();
      expect(mocks.players.upsert.mock.calls[0][0]).toMatchObject(
        characteristics,
      );
    });

    it("passes no rules set when the hire's era resolved to none", async () => {
      const curated: MercenaryCurated = { loaded: false };
      const service = await makeService((m) => {
        m.positions.forPlayer.mockResolvedValue({
          positionId: 55,
          mercenary: curated,
        });
      });

      await run(service, {
        players: [rosterPlayer({ characteristics: undefined })],
        context: rosterContext({ rulesSet: undefined }),
      });

      expect(
        mocks.mercenaryCharacteristics.forRosterPlayer,
      ).toHaveBeenCalledWith(expect.objectContaining({ rulesSet: undefined }));
    });
  });

  describe('retiring players who left the roster', () => {
    it('retires the era players absent from the roster file and the snapshots', async () => {
      const service = await makeService();

      await run(service, {
        players: [rosterPlayer({ id: 5001 }), rosterPlayer({ id: 5002 })],
        embedded: [rosterPlayer({ id: 5009 })],
      });

      expect(mocks.players.retireAbsentExternalPlayers).toHaveBeenCalledTimes(
        1,
      );
      const options =
        mocks.players.retireAbsentExternalPlayers.mock.calls[0][0];
      expect(options.teamEraId).toBe(TEAM_ERA_ID);
      expect(options.externalSystemId).toBe(TP_SYSTEM_ID);
      expect([...options.presentExternalIds].sort()).toEqual([
        '5001',
        '5002',
        '5009',
      ]);
    });

    it('keeps a player whose own upsert failed out of the retirement', async () => {
      const service = await makeService((m) => {
        m.players.upsert.mockRejectedValue(new Error('boom'));
      });

      await run(service, { players: [rosterPlayer({ id: 5001 })] });

      expect(
        mocks.players.retireAbsentExternalPlayers.mock.calls[0][0]
          .presentExternalIds,
      ).toEqual(['5001']);
    });

    it('retires nobody when the roster file lists no players', async () => {
      const service = await makeService();

      await run(service, {
        players: [],
        embedded: [rosterPlayer({ id: 5009 })],
      });

      expect(mocks.players.retireAbsentExternalPlayers).not.toHaveBeenCalled();
    });

    it('records a failure and still returns the imported players', async () => {
      const service = await makeService((m) => {
        m.players.retireAbsentExternalPlayers.mockRejectedValue(
          new Error('db down'),
        );
      });

      const outcome = await run(service);

      expect(outcome.imported).toBe(1);
      expect(errors).toEqual([
        {
          item: { teamEraId: TEAM_ERA_ID },
          message: 'Failed to retire players who left the roster: db down',
        },
      ]);
    });
  });

  describe('status', () => {
    it("decides a roster player's status from its own state and isActive", async () => {
      const service = await makeService((m) =>
        m.status.forPlayer.mockReturnValue('temporarily_retired'),
      );

      await run(service, {
        players: [rosterPlayer({ state: 12289, isActive: true })],
      });

      expect(mocks.status.forPlayer).toHaveBeenCalledWith({
        state: 12289,
        isActive: true,
      });
      expect(mocks.players.upsert.mock.calls[0][0]).toMatchObject({
        status: 'temporarily_retired',
      });
    });

    it('sends an active snapshot-only player as active', async () => {
      const service = await makeService((m) =>
        m.status.forPlayer.mockReturnValue('active'),
      );

      await run(service, {
        players: [],
        embedded: [rosterPlayer({ id: 5009, state: 4096, isActive: true })],
      });

      expect(mocks.status.forPlayer).toHaveBeenCalledWith({
        state: 4096,
        isActive: true,
      });
      expect(mocks.players.upsert.mock.calls[0][0]).toMatchObject({
        status: 'active',
      });
    });

    it("decides a player in both sources from the roster file's fields", async () => {
      const service = await makeService();

      await run(service, {
        players: [rosterPlayer({ state: 1, isActive: true })],
        embedded: [rosterPlayer({ state: 16, isActive: false })],
      });

      expect(mocks.status.forPlayer).toHaveBeenCalledTimes(1);
      expect(mocks.status.forPlayer).toHaveBeenCalledWith({
        state: 1,
        isActive: true,
      });
    });

    it('sends an unknown status explicitly as null', async () => {
      const service = await makeService();

      await run(service);

      expect(mocks.players.upsert.mock.calls[0][0]).toHaveProperty(
        'status',
        null,
      );
    });

    it('passes undefined fields through for an entry carrying neither', async () => {
      const service = await makeService();

      await run(service);

      expect(mocks.status.forPlayer).toHaveBeenCalledWith({
        state: undefined,
        isActive: undefined,
      });
    });
  });
});
