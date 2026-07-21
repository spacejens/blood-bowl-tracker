import type {
  ExternalSystemBootstrapService,
  PlayersImportService,
} from '@blood-bowl-tracker/import';
import { describe, expect, it, vi } from 'vitest';

import type { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import type { RosterEntry } from '../source/roster-collection.service';
import { TpPlayersImportService } from './tp-players-import.service';

interface MakeServiceOptions {
  upsertPlayerResult: ReturnType<typeof vi.fn>;
  bootstrap?: ReturnType<typeof vi.fn>;
  getTpSystemName?: () => string;
}

function makeService({
  upsertPlayerResult,
  bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1] }),
  getTpSystemName = () => 'TP',
}: MakeServiceOptions) {
  return new TpPlayersImportService(
    { upsertPlayerResult } as unknown as PlayersImportService,
    { bootstrap } as unknown as ExternalSystemBootstrapService,
    { getTpSystemName } as unknown as ExternalSystemNameConfigService,
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
});
