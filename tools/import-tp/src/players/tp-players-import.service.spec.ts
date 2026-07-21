import type {
  ExternalSystemBootstrapService,
  PlayersImportService,
  PositionsImportService,
} from '@blood-bowl-tracker/import';
import { describe, expect, it, vi } from 'vitest';

import type { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import type { RosterEntry } from '../source/roster-collection.service';
import { TpPlayersImportService } from './tp-players-import.service';

interface MakeServiceOptions {
  upsertPlayerResult: ReturnType<typeof vi.fn>;
  bootstrap?: ReturnType<typeof vi.fn>;
  getTpSystemName?: () => string;
  upsertPosition?: ReturnType<typeof vi.fn>;
}

function makeService({
  upsertPlayerResult,
  bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1] }),
  getTpSystemName = () => 'TP',
  upsertPosition = vi.fn(),
}: MakeServiceOptions) {
  return new TpPlayersImportService(
    { upsertPlayerResult } as unknown as PlayersImportService,
    { bootstrap } as unknown as ExternalSystemBootstrapService,
    { getTpSystemName } as unknown as ExternalSystemNameConfigService,
    { upsertPosition } as unknown as PositionsImportService,
  );
}

const rosters: RosterEntry[] = [
  {
    era: 'Third Era',
    competition: 'comp',
    roster: {
      id: 123,
      teamName: 'Team 123',
      teamRaceCode: 'Dwarf',
      raceName: 'Dwarf',
      coachTpId: 'coach-1',
      positions: [{ tpPositionId: 952, name: 'Dwarf Lineman' }],
      players: [
        {
          id: 2412443,
          name: 'The Agitated Deviation',
          number: 4,
          lineUpMasterId: 952,
          rosterId: 123,
        },
      ],
    },
  },
];

describe('TpPlayersImportService', () => {
  it('imports a resolvable roster player and maps its lineUpId to the DB id', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const service = makeService({ upsertPlayerResult });

    const { result, playerIdsByLineUpId } = await service.importPlayers({
      rosters,
      teamErasByRosterId: new Map([[123, [{ id: 5000, eraId: 500 }]]]),
      eraIdsByName: new Map([['Third Era', 500]]),
      positionIdsByTpPositionId: new Map([[952, 200]]),
    });

    expect(result.imported).toBe(1);
    expect(playerIdsByLineUpId.get(2412443)).toBe(900);
    expect(upsertPlayerResult).toHaveBeenCalledWith(
      {
        name: 'The Agitated Deviation',
        teamEraId: 5000,
        positionId: 200,
        externalIds: [{ externalSystemId: 1, externalId: '2412443' }],
      },
      expect.anything(),
    );
  });

  it('records an unknown-era error and skips a player whose roster era is not imported', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const service = makeService({ upsertPlayerResult });

    const { result, playerIdsByLineUpId } = await service.importPlayers({
      rosters,
      teamErasByRosterId: new Map([[123, [{ id: 5000, eraId: 500 }]]]),
      eraIdsByName: new Map(),
      positionIdsByTpPositionId: new Map([[952, 200]]),
    });

    expect(playerIdsByLineUpId.size).toBe(0);
    expect(
      result.errors.some((e) => e.message.toLowerCase().includes('era')),
    ).toBe(true);
    expect(upsertPlayerResult).not.toHaveBeenCalled();
  });

  it('records a non-fatal error and skips a player whose team era cannot be resolved', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const service = makeService({ upsertPlayerResult });

    const { result, playerIdsByLineUpId } = await service.importPlayers({
      rosters,
      teamErasByRosterId: new Map(),
      eraIdsByName: new Map([['Third Era', 500]]),
      positionIdsByTpPositionId: new Map([[952, 200]]),
    });

    expect(playerIdsByLineUpId.size).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(upsertPlayerResult).not.toHaveBeenCalled();
  });

  it('records a non-fatal error and skips a player whose position cannot be resolved', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const service = makeService({ upsertPlayerResult });

    const { result, playerIdsByLineUpId } = await service.importPlayers({
      rosters,
      teamErasByRosterId: new Map([[123, [{ id: 5000, eraId: 500 }]]]),
      eraIdsByName: new Map([['Third Era', 500]]),
      positionIdsByTpPositionId: new Map(),
    });

    expect(playerIdsByLineUpId.size).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(upsertPlayerResult).not.toHaveBeenCalled();
  });

  it('imports nothing and records one error when external system bootstrap fails', async () => {
    const upsertPlayerResult = vi.fn();
    const service = makeService({
      upsertPlayerResult,
      bootstrap: vi.fn().mockResolvedValue({
        ok: false,
        error: { item: { externalSystems: ['TP'] }, message: 'boom' },
      }),
    });

    const { result, playerIdsByLineUpId } = await service.importPlayers({
      rosters,
      teamErasByRosterId: new Map([[123, [{ id: 5000, eraId: 500 }]]]),
      eraIdsByName: new Map([['Third Era', 500]]),
      positionIdsByTpPositionId: new Map([[952, 200]]),
    });

    expect(result.errors).toHaveLength(1);
    expect(playerIdsByLineUpId.size).toBe(0);
    expect(upsertPlayerResult).not.toHaveBeenCalled();
  });

  it('imports a hired star player as an isStarPlayer position + a player on the hiring team-era', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const upsertPosition = vi.fn().mockResolvedValue({ id: 700 });
    const service = makeService({ upsertPlayerResult, upsertPosition });

    const { starPlayerIdsByRosterAndMaster } = await service.importPlayers({
      rosters,
      teamErasByRosterId: new Map([[168446, [{ id: 6000, eraId: 500 }]]]),
      eraIdsByName: new Map([['Third Era', 500]]),
      positionIdsByTpPositionId: new Map(),
      inducedStarPlayersByRosterId: new Map([
        [
          168446,
          [{ name: 'Fungus the Loon', lineUpMasterId: 1122, number: 11 }],
        ],
      ]),
    });

    expect(upsertPosition).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Fungus the Loon', isStarPlayer: true }),
      expect.anything(),
    );
    expect(upsertPlayerResult).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Fungus the Loon',
        teamEraId: 6000,
        positionId: 700,
      }),
      expect.anything(),
    );
    expect(starPlayerIdsByRosterAndMaster.get('168446:1122')).toBe(900);
  });

  it('records a non-fatal error and skips a star player whose hiring team-era cannot be resolved', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const upsertPosition = vi.fn().mockResolvedValue({ id: 700 });
    const service = makeService({ upsertPlayerResult, upsertPosition });

    const { result, starPlayerIdsByRosterAndMaster } =
      await service.importPlayers({
        rosters,
        teamErasByRosterId: new Map(),
        eraIdsByName: new Map([['Third Era', 500]]),
        positionIdsByTpPositionId: new Map(),
        inducedStarPlayersByRosterId: new Map([
          [
            168446,
            [{ name: 'Fungus the Loon', lineUpMasterId: 1122, number: 11 }],
          ],
        ]),
      });

    expect(starPlayerIdsByRosterAndMaster.size).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(upsertPosition).not.toHaveBeenCalled();
    expect(upsertPlayerResult).not.toHaveBeenCalled();
  });

  it('does not redundantly re-import the same hired star player within one run', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const upsertPosition = vi.fn().mockResolvedValue({ id: 700 });
    const service = makeService({ upsertPlayerResult, upsertPosition });

    const { starPlayerIdsByRosterAndMaster } = await service.importPlayers({
      rosters,
      teamErasByRosterId: new Map([[168446, [{ id: 6000, eraId: 500 }]]]),
      eraIdsByName: new Map([['Third Era', 500]]),
      positionIdsByTpPositionId: new Map(),
      inducedStarPlayersByRosterId: new Map([
        [
          168446,
          [
            { name: 'Fungus the Loon', lineUpMasterId: 1122, number: 11 },
            { name: 'Fungus the Loon', lineUpMasterId: 1122, number: 11 },
          ],
        ],
      ]),
    });

    expect(upsertPosition).toHaveBeenCalledTimes(1);
    expect(upsertPlayerResult).toHaveBeenCalledTimes(1);
    expect(starPlayerIdsByRosterAndMaster.get('168446:1122')).toBe(900);
  });

  it('skips a star player without creating a player when the position upsert fails', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const upsertPosition = vi.fn().mockResolvedValue(undefined);
    const service = makeService({ upsertPlayerResult, upsertPosition });

    const { starPlayerIdsByRosterAndMaster } = await service.importPlayers({
      rosters,
      teamErasByRosterId: new Map([[168446, [{ id: 6000, eraId: 500 }]]]),
      eraIdsByName: new Map([['Third Era', 500]]),
      positionIdsByTpPositionId: new Map(),
      inducedStarPlayersByRosterId: new Map([
        [
          168446,
          [{ name: 'Fungus the Loon', lineUpMasterId: 1122, number: 11 }],
        ],
      ]),
    });

    expect(starPlayerIdsByRosterAndMaster.size).toBe(0);
    expect(upsertPlayerResult).not.toHaveBeenCalled();
  });

  it('disambiguates a hiring team-era spanning multiple eras via the roster file own era', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const upsertPosition = vi.fn().mockResolvedValue({ id: 700 });
    const service = makeService({ upsertPlayerResult, upsertPosition });

    const multiEraRosters: RosterEntry[] = [
      ...rosters,
      {
        era: 'Fourth Era',
        competition: 'comp',
        roster: {
          id: 168446,
          teamName: 'Team 168446',
          teamRaceCode: 'Human',
          raceName: 'Human',
          coachTpId: 'coach-2',
          positions: [],
          players: [],
        },
      },
    ];

    const { starPlayerIdsByRosterAndMaster } = await service.importPlayers({
      rosters: multiEraRosters,
      teamErasByRosterId: new Map([
        [
          168446,
          [
            { id: 6000, eraId: 500 },
            { id: 6001, eraId: 501 },
          ],
        ],
      ]),
      eraIdsByName: new Map([
        ['Third Era', 500],
        ['Fourth Era', 501],
      ]),
      positionIdsByTpPositionId: new Map(),
      inducedStarPlayersByRosterId: new Map([
        [
          168446,
          [{ name: 'Fungus the Loon', lineUpMasterId: 1122, number: 11 }],
        ],
      ]),
    });

    expect(upsertPlayerResult).toHaveBeenCalledWith(
      expect.objectContaining({ teamEraId: 6001 }),
      expect.anything(),
    );
    expect(starPlayerIdsByRosterAndMaster.get('168446:1122')).toBe(900);
  });
});
