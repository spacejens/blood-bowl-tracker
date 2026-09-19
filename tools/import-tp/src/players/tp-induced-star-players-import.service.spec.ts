import type { UpsertPosition } from '@blood-bowl-tracker/api-contract';
import type { ImportError } from '@blood-bowl-tracker/import';
import {
  ImportResultService,
  NameExternalIdService,
  PlayersImportService,
  PositionsImportService,
} from '@blood-bowl-tracker/import';
import type { TpPositionCharacteristics } from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import {
  asProviderMethod,
  mockImportResultService,
  mockNameExternalIdService,
} from '../import-package.test-helpers';
import type { InducedStarPlayerHireGroup } from './tp-induced-star-players-import.service';
import { TpInducedStarPlayersImportService } from './tp-induced-star-players-import.service';
import { TpPlayerCharacteristicsBuilderService } from './tp-player-characteristics-builder.service';

interface MakeServiceOptions {
  upsertPlayerResult: ReturnType<typeof vi.fn>;
  upsertPosition?: ReturnType<typeof vi.fn>;
  starCharacteristics?: {
    move: number;
    strength: number;
    agility: number;
    passing: number;
    armour: number;
    rulesSetId: number;
  };
  /**
   * Use the REAL TpPlayerCharacteristicsBuilderService instead of a mock.
   * It is a pure, dependency-free formatting service (no constructor, no
   * I/O), so passing it real carries no coupling risk -- used by the tests
   * that verify `characteristicsByPositionId` wiring end-to-end, which a
   * canned `forStarPosition` return value can't exercise.
   */
  realCharacteristicsBuilder?: boolean;
}

async function makeService({
  upsertPlayerResult,
  upsertPosition = vi.fn(),
  starCharacteristics,
  realCharacteristicsBuilder = false,
}: MakeServiceOptions): Promise<{
  service: TpInducedStarPlayersImportService;
  importResults: MockProxy<ImportResultService>;
}> {
  const playersImport = mock<PlayersImportService>();
  playersImport.upsertPlayerResult.mockImplementation(
    asProviderMethod(upsertPlayerResult),
  );
  const positionsImport = mock<PositionsImportService>();
  positionsImport.upsert.mockImplementation(asProviderMethod(upsertPosition));
  const nameExternalId = mockNameExternalIdService();
  const characteristicsBuilder = mock<TpPlayerCharacteristicsBuilderService>();
  characteristicsBuilder.forStarPosition.mockReturnValue(starCharacteristics);
  const importResults = mockImportResultService();

  const moduleRef = await Test.createTestingModule({
    providers: [
      TpInducedStarPlayersImportService,
      { provide: PlayersImportService, useValue: playersImport },
      { provide: PositionsImportService, useValue: positionsImport },
      { provide: NameExternalIdService, useValue: nameExternalId },
      realCharacteristicsBuilder
        ? TpPlayerCharacteristicsBuilderService
        : {
            provide: TpPlayerCharacteristicsBuilderService,
            useValue: characteristicsBuilder,
          },
      { provide: ImportResultService, useValue: importResults },
    ],
  }).compile();
  return {
    service: moduleRef.get(TpInducedStarPlayersImportService),
    importResults,
  };
}

const TP_SYSTEM_ID = 1;
const NAME_SYSTEM_ID = 2;

/** The context object every `importHires` call needs, with sensible
 * defaults a test can override piecemeal. */
function context(
  overrides: Partial<{
    eraNameByEraId: Map<number, string>;
    rulesSetIdByEraName: Map<string, number>;
    characteristicsByPositionId: Map<
      number,
      Map<number, TpPositionCharacteristics>
    >;
  }> = {},
): {
  tpSystemId: number;
  nameSystemId: number;
  eraNameByEraId: Map<number, string>;
  rulesSetIdByEraName: Map<string, number>;
  characteristicsByPositionId?: Map<
    number,
    Map<number, TpPositionCharacteristics>
  >;
} {
  return {
    tpSystemId: TP_SYSTEM_ID,
    nameSystemId: NAME_SYSTEM_ID,
    eraNameByEraId: overrides.eraNameByEraId ?? new Map([[500, 'Third Era']]),
    rulesSetIdByEraName:
      overrides.rulesSetIdByEraName ?? new Map([['Third Era', 900]]),
    characteristicsByPositionId: overrides.characteristicsByPositionId,
  };
}

describe('TpInducedStarPlayersImportService', () => {
  it('imports a hired star player as an isStarPlayer position + a player on the hiring team-era', async () => {
    const upsertPlayerResult = vi
      .fn()
      .mockResolvedValue({ id: 900, created: true });
    const upsertPosition = vi.fn().mockResolvedValue({ id: 700 });
    const { service } = await makeService({
      upsertPlayerResult,
      upsertPosition,
    });

    const groups: InducedStarPlayerHireGroup[] = [
      {
        rosterId: 168446,
        eraId: 500,
        starPlayers: [
          { name: 'Fungus the Loon', lineUpMasterId: 1122, number: 11 },
        ],
      },
    ];
    const errors: ImportError[] = [];

    const { imported, starPlayerIdsByRosterAndMaster, insertedPlayerIds } =
      await service.importHires({
        groups,
        teamErasByRosterId: new Map([[168446, [{ id: 6000, eraId: 500 }]]]),
        context: context(),
        errors,
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
    expect(imported).toBe(1);
    expect(starPlayerIdsByRosterAndMaster.get('168446:1122')).toBe(900);
    // A freshly hired star is a genuine new players row, same as any other
    // inserted player.
    expect(insertedPlayerIds).toEqual([900]);
  });

  it('records a non-fatal error and skips a star player whose hiring team-era cannot be resolved', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const upsertPosition = vi.fn().mockResolvedValue({ id: 700 });
    const { service } = await makeService({
      upsertPlayerResult,
      upsertPosition,
    });
    const errors: ImportError[] = [];

    const { starPlayerIdsByRosterAndMaster } = await service.importHires({
      groups: [
        {
          rosterId: 168446,
          eraId: 500,
          starPlayers: [
            { name: 'Fungus the Loon', lineUpMasterId: 1122, number: 11 },
          ],
        },
      ],
      teamErasByRosterId: new Map(),
      context: context(),
      errors,
    });

    expect(starPlayerIdsByRosterAndMaster.size).toBe(0);
    expect(errors.length).toBeGreaterThan(0);
    expect(upsertPosition).not.toHaveBeenCalled();
    expect(upsertPlayerResult).not.toHaveBeenCalled();
  });

  it('does not redundantly re-import the same hired star player within one run', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const upsertPosition = vi.fn().mockResolvedValue({ id: 700 });
    const { service } = await makeService({
      upsertPlayerResult,
      upsertPosition,
    });

    const { starPlayerIdsByRosterAndMaster } = await service.importHires({
      groups: [
        {
          rosterId: 168446,
          eraId: 500,
          starPlayers: [
            { name: 'Fungus the Loon', lineUpMasterId: 1122, number: 11 },
            { name: 'Fungus the Loon', lineUpMasterId: 1122, number: 11 },
          ],
        },
      ],
      teamErasByRosterId: new Map([[168446, [{ id: 6000, eraId: 500 }]]]),
      context: context(),
      errors: [],
    });

    expect(upsertPosition).toHaveBeenCalledTimes(1);
    expect(upsertPlayerResult).toHaveBeenCalledTimes(1);
    expect(starPlayerIdsByRosterAndMaster.get('168446:1122')).toBe(900);
  });

  it('skips a star player without creating a player when the position upsert fails', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const upsertPosition = vi.fn().mockResolvedValue(undefined);
    const { service } = await makeService({
      upsertPlayerResult,
      upsertPosition,
    });

    const { starPlayerIdsByRosterAndMaster } = await service.importHires({
      groups: [
        {
          rosterId: 168446,
          eraId: 500,
          starPlayers: [
            { name: 'Fungus the Loon', lineUpMasterId: 1122, number: 11 },
          ],
        },
      ],
      teamErasByRosterId: new Map([[168446, [{ id: 6000, eraId: 500 }]]]),
      context: context(),
      errors: [],
    });

    expect(starPlayerIdsByRosterAndMaster.size).toBe(0);
    expect(upsertPlayerResult).not.toHaveBeenCalled();
  });

  it('attaches a Name-system bare-name external id to hired star positions', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const upsertPosition = vi.fn().mockResolvedValue({ id: 700 });
    const { service } = await makeService({
      upsertPlayerResult,
      upsertPosition,
    });

    await service.importHires({
      groups: [
        {
          rosterId: 168446,
          eraId: 500,
          starPlayers: [
            { name: 'Griff Oberwald', lineUpMasterId: 1122, number: 11 },
          ],
        },
      ],
      teamErasByRosterId: new Map([[168446, [{ id: 6000, eraId: 500 }]]]),
      context: context(),
      errors: [],
    });

    const starPositionUpsert = upsertPosition.mock.calls
      .map((c) => c[0] as UpsertPosition)
      .find((d) => d.isStarPlayer && d.name === 'Griff Oberwald');
    expect(starPositionUpsert?.externalIds).toEqual([
      { externalSystemId: TP_SYSTEM_ID, externalId: 'Griff Oberwald' },
      { externalSystemId: NAME_SYSTEM_ID, externalId: 'Griff Oberwald' },
    ]);
  });

  it('disambiguates a hiring team-era spanning multiple eras via the hire group real eraId', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 900 });
    const upsertPosition = vi.fn().mockResolvedValue({ id: 700 });
    const { service } = await makeService({
      upsertPlayerResult,
      upsertPosition,
    });

    // teamErasByRosterId.get(168446) returns two genuinely ambiguous
    // candidates. The first one is deliberately the WRONG era for this hire:
    // a naive `.find()` in roster order would pick teamEraId 6000 instead of
    // the correct 6001, so this test only passes when resolution uses the
    // real eraId.
    const { starPlayerIdsByRosterAndMaster } = await service.importHires({
      groups: [
        {
          rosterId: 168446,
          // The hiring match's competition resolved to eraId 501, which must
          // select the 6001 team-era, not the first candidate (6000).
          eraId: 501,
          starPlayers: [
            { name: 'Fungus the Loon', lineUpMasterId: 1122, number: 11 },
          ],
        },
      ],
      teamErasByRosterId: new Map([
        [
          168446,
          [
            { id: 6000, eraId: 500 },
            { id: 6001, eraId: 501 },
          ],
        ],
      ]),
      context: context({
        eraNameByEraId: new Map([
          [500, 'Third Era'],
          [501, 'Fourth Era'],
        ]),
        rulesSetIdByEraName: new Map([
          ['Third Era', 900],
          ['Fourth Era', 901],
        ]),
      }),
      errors: [],
    });

    expect(upsertPlayerResult).toHaveBeenCalledWith(
      expect.objectContaining({ teamEraId: 6001 }),
      expect.anything(),
    );
    expect(starPlayerIdsByRosterAndMaster.get('168446:1122')).toBe(900);
  });

  it('passes no sppTotal for an induced star player, whose TP data has no total', async () => {
    // TpInducedStarPlayer carries no totalStarPlayerPoints, so the column is
    // left untouched (NULL) rather than being written a made-up 0.
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 950 });
    const upsertPosition = vi.fn().mockResolvedValue({ id: 300 });
    const { service } = await makeService({
      upsertPlayerResult,
      upsertPosition,
    });

    await service.importHires({
      groups: [
        {
          rosterId: 123,
          eraId: 500,
          starPlayers: [
            { name: "Morg 'n' Thorg", lineUpMasterId: 5002, number: 16 },
          ],
        },
      ],
      teamErasByRosterId: new Map([[123, [{ id: 5000, eraId: 500 }]]]),
      context: context(),
      errors: [],
    });

    const payload = upsertPlayerResult.mock.calls[0][0] as {
      sppTotal?: number;
    };
    expect('sppTotal' in payload).toBe(false);
  });

  it("sends a hired star the star position's characteristics for that era's rules set", async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 950 });
    const upsertPosition = vi.fn().mockResolvedValue({ id: 70 });
    const { service } = await makeService({
      upsertPlayerResult,
      upsertPosition,
      realCharacteristicsBuilder: true,
    });

    await service.importHires({
      groups: [
        {
          rosterId: 123,
          eraId: 500,
          starPlayers: [
            { name: 'Grim Ironjaw', lineUpMasterId: 5001, number: 16 },
          ],
        },
      ],
      teamErasByRosterId: new Map([[123, [{ id: 5000, eraId: 500 }]]]),
      context: context({
        characteristicsByPositionId: new Map([
          [
            70,
            new Map([
              [
                900,
                { move: 5, strength: 4, agility: 4, passing: 5, armour: 10 },
              ],
            ]),
          ],
        ]),
      }),
      errors: [],
    });

    expect(upsertPlayerResult).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Grim Ironjaw',
        move: 5,
        strength: 4,
        agility: 4,
        passing: 5,
        armour: 10,
        rulesSetId: 900,
      }),
      expect.anything(),
    );
  });

  it('imports a hired star without characteristics when the position has none, recording no extra error', async () => {
    const upsertPlayerResult = vi.fn().mockResolvedValue({ id: 950 });
    const upsertPosition = vi.fn().mockResolvedValue({ id: 70 });
    const { service, importResults } = await makeService({
      upsertPlayerResult,
      upsertPosition,
      realCharacteristicsBuilder: true,
    });
    const errors: ImportError[] = [];

    await service.importHires({
      groups: [
        {
          rosterId: 123,
          eraId: 500,
          starPlayers: [
            { name: 'Grim Ironjaw', lineUpMasterId: 5001, number: 16 },
          ],
        },
      ],
      teamErasByRosterId: new Map([[123, [{ id: 5000, eraId: 500 }]]]),
      context: context({ characteristicsByPositionId: new Map() }),
      errors,
    });

    const payload = upsertPlayerResult.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(payload.name).toBe('Grim Ironjaw');
    expect(payload).not.toHaveProperty('move');
    expect(payload).not.toHaveProperty('rulesSetId');
    expect(errors).toHaveLength(0);
    expect(importResults.error).not.toHaveBeenCalled();
  });
});
