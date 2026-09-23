import type { ImportError } from '@blood-bowl-tracker/api-contract';
import { PositionsService } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpImportResultsService } from '../../tp-import-results.service';
import { TpNameExternalIdService } from '../../tp-name-external-id.service';
import { TpUpsertRunnerService } from '../../tp-upsert-runner.service';
import {
  NAME_SYSTEM_ID,
  rosterContext,
  rosterPlayer,
  TP_SYSTEM_ID,
} from '../tp-roster.test-helpers';
import type { MercenaryCurated } from './tp-mercenary-characteristics.service';
import { TpMercenaryCharacteristicsService } from './tp-mercenary-characteristics.service';
import type { MercenaryPositionCache } from './tp-player-position.service';
import { TpPlayerPositionService } from './tp-player-position.service';

type PositionUpsertResult = Awaited<ReturnType<PositionsService['upsert']>>;

const CURATED: MercenaryCurated = {
  loaded: true,
  byRulesSetId: new Map(),
  rejectedRulesSetIds: new Set(),
};

describe('TpPlayerPositionService', () => {
  let service: TpPlayerPositionService;
  let positions: MockProxy<PositionsService>;
  let mercenaryCharacteristics: MockProxy<TpMercenaryCharacteristicsService>;
  let mercenaryCache: MercenaryPositionCache;
  let errors: ImportError[];

  beforeEach(async () => {
    positions = mock<PositionsService>();
    mercenaryCharacteristics = mock<TpMercenaryCharacteristicsService>();
    mercenaryCache = new Map();
    errors = [];
    positions.upsert.mockResolvedValue({
      position: mock<PositionUpsertResult['position']>({ id: 55 }),
      created: true,
    });
    mercenaryCharacteristics.loadPositionCharacteristics.mockResolvedValue(
      CURATED,
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpPlayerPositionService,
        TpImportResultsService,
        TpUpsertRunnerService,
        TpNameExternalIdService,
        { provide: PositionsService, useValue: positions },
        {
          provide: TpMercenaryCharacteristicsService,
          useValue: mercenaryCharacteristics,
        },
      ],
    }).compile();
    service = moduleRef.get(TpPlayerPositionService);
  });

  describe('resolveCatalogPositions', () => {
    it('resolves every distinct lineUpMasterId in one batched call', async () => {
      positions.resolveBatch.mockResolvedValue([
        { found: true, id: 11 },
        { found: false },
      ]);

      const resolved = await service.resolveCatalogPositions({
        players: [
          rosterPlayer({ id: 1, lineUpMasterId: 77 }),
          rosterPlayer({ id: 2, lineUpMasterId: 78 }),
          rosterPlayer({ id: 3, lineUpMasterId: 77 }),
        ],
        tpSystemId: TP_SYSTEM_ID,
      });

      expect(positions.resolveBatch).toHaveBeenCalledTimes(1);
      expect(positions.resolveBatch).toHaveBeenCalledWith([
        { externalSystemId: TP_SYSTEM_ID, externalId: '77' },
        { externalSystemId: TP_SYSTEM_ID, externalId: '78' },
      ]);
      expect([...resolved]).toEqual([[77, 11]]);
    });

    it('makes no call for a roster with no players', async () => {
      await expect(
        service.resolveCatalogPositions({
          players: [],
          tpSystemId: TP_SYSTEM_ID,
        }),
      ).resolves.toEqual(new Map());
      expect(positions.resolveBatch).not.toHaveBeenCalled();
    });
  });

  describe('forPlayer', () => {
    const forPlayer = (
      player = rosterPlayer(),
      catalogPositionIds = new Map([[77, 11]]),
    ) =>
      service.forPlayer({
        player,
        catalogPositionIds,
        context: rosterContext(),
        mercenaryCache,
        errors,
      });

    it("uses the catalog position for the player's lineUpMasterId", async () => {
      await expect(forPlayer()).resolves.toEqual({
        positionId: 11,
        mercenary: undefined,
      });
      expect(positions.upsert).not.toHaveBeenCalled();
    });

    it('falls back to a star position named after a mercenary Big Guy, with its curated rows', async () => {
      const giant = rosterPlayer({
        lineUpMasterId: 999,
        isBigGuy: true,
        fallbackPositionName: 'Giant Mercenary',
      });

      await expect(forPlayer(giant)).resolves.toEqual({
        positionId: 55,
        mercenary: CURATED,
      });
      expect(positions.upsert).toHaveBeenCalledWith({
        name: 'Giant Mercenary',
        isStarPlayer: true,
        externalIds: [
          { externalSystemId: TP_SYSTEM_ID, externalId: 'Giant Mercenary' },
          { externalSystemId: NAME_SYSTEM_ID, externalId: 'Giant Mercenary' },
        ],
      });
      expect(
        mercenaryCharacteristics.loadPositionCharacteristics,
      ).toHaveBeenCalledWith({
        positionName: 'Giant Mercenary',
        positionId: 55,
        errors,
      });
    });

    it('reuses one mercenary position and its curated rows across hires sharing a name', async () => {
      const giant = rosterPlayer({
        lineUpMasterId: 999,
        isBigGuy: true,
        fallbackPositionName: 'Giant Mercenary',
      });

      await forPlayer(giant);
      await forPlayer({ ...giant, id: 5002 });

      expect(positions.upsert).toHaveBeenCalledTimes(1);
      expect(
        mercenaryCharacteristics.loadPositionCharacteristics,
      ).toHaveBeenCalledTimes(1);
    });

    it('skips a mercenary Big Guy with errors when the fallback position upsert fails', async () => {
      positions.upsert.mockRejectedValue(new Error('conflict'));
      const giant = rosterPlayer({
        lineUpMasterId: 999,
        isBigGuy: true,
        fallbackPositionName: 'Giant Mercenary',
      });

      await expect(forPlayer(giant)).resolves.toBeUndefined();
      expect(errors.map((error) => error.message)).toEqual([
        'Failed to import position "Giant Mercenary": conflict',
        'Skipped player "Grim" (5001): could not resolve position for lineUpMasterId 999',
      ]);
      expect(
        mercenaryCharacteristics.loadPositionCharacteristics,
      ).not.toHaveBeenCalled();
    });

    it('does not fall back for a player that is not a Big Guy', async () => {
      await expect(
        forPlayer(rosterPlayer({ lineUpMasterId: 999 })),
      ).resolves.toBeUndefined();
      expect(positions.upsert).not.toHaveBeenCalled();
      expect(errors).toEqual([
        {
          item: { player: 5001, lineUpMasterId: 999 },
          message:
            'Skipped player "Grim" (5001): could not resolve position for lineUpMasterId 999',
        },
      ]);
    });
  });
});
