import { SppAdjustmentsService } from '@blood-bowl-tracker/game-data';
import {
  ImportResultService,
  UpsertRecorderService,
} from '@blood-bowl-tracker/import-shared';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import {
  SPP_ADJUSTMENTS_CHUNK_SIZE,
  TpLiveSppAdjustmentsService,
} from './tp-live-spp-adjustments.service';

const COUNTS = {
  touchdown: 3,
  completion: 4,
  interception: 1,
  mvp_award: 2,
  casualty: 5,
};

describe('TpLiveSppAdjustmentsService', () => {
  let service: TpLiveSppAdjustmentsService;
  let sppAdjustments: MockProxy<SppAdjustmentsService>;

  beforeEach(async () => {
    sppAdjustments = mock<SppAdjustmentsService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpLiveSppAdjustmentsService,
        ImportResultService,
        UpsertRecorderService,
        { provide: SppAdjustmentsService, useValue: sppAdjustments },
      ],
    }).compile();
    service = moduleRef.get(TpLiveSppAdjustmentsService);
  });

  it('settles nothing, and calls nothing, when there are no players', async () => {
    await expect(service.settle([])).resolves.toEqual({
      success: true,
      imported: 0,
      errors: [],
    });
    expect(sppAdjustments.syncReportedAdjustments).not.toHaveBeenCalled();
  });

  it('leaves out the excluded players, and calls nothing when that leaves no one', async () => {
    sppAdjustments.syncReportedAdjustments.mockResolvedValue({
      updatedPlayerIds: [2],
    });

    const result = await service.settle(
      [
        { playerId: 1, reportedSppTotal: 5 },
        { playerId: 2, reportedSppTotal: 6 },
      ],
      { excludePlayerIds: [1] },
    );

    expect(sppAdjustments.syncReportedAdjustments).toHaveBeenCalledWith({
      players: [{ playerId: 2, reportedSppTotal: 6 }],
    });
    expect(result.imported).toBe(1);

    sppAdjustments.syncReportedAdjustments.mockClear();
    await expect(
      service.settle([{ playerId: 1, reportedSppTotal: 5 }], {
        excludePlayerIds: [1],
      }),
    ).resolves.toEqual({ success: true, imported: 0, errors: [] });
    expect(sppAdjustments.syncReportedAdjustments).not.toHaveBeenCalled();
  });

  it("sends each player's facts and counts the players the sync updated", async () => {
    sppAdjustments.syncReportedAdjustments.mockResolvedValue({
      updatedPlayerIds: [1, 2],
      nonzeroAdjustments: [],
    });

    const result = await service.settle([
      { playerId: 1, reportedSppTotal: 12, careerCounts: COUNTS },
      { playerId: 2, reportedSppTotal: 4 },
    ]);

    expect(sppAdjustments.syncReportedAdjustments).toHaveBeenCalledWith({
      players: [
        { playerId: 1, reportedSppTotal: 12, careerCounts: COUNTS },
        { playerId: 2, reportedSppTotal: 4 },
      ],
    });
    expect(result).toEqual({ success: true, imported: 2, errors: [] });
  });

  it('merges a repeated player, keeping the highest total and the highest of each counter', async () => {
    sppAdjustments.syncReportedAdjustments.mockResolvedValue({
      updatedPlayerIds: [1],
    });

    await service.settle([
      {
        playerId: 1,
        reportedSppTotal: 14,
        careerCounts: { ...COUNTS, touchdown: 5 },
      },
      {
        playerId: 1,
        reportedSppTotal: 12,
        careerCounts: { ...COUNTS, casualty: 9 },
      },
    ]);

    expect(sppAdjustments.syncReportedAdjustments).toHaveBeenCalledWith({
      players: [
        {
          playerId: 1,
          reportedSppTotal: 14,
          careerCounts: { ...COUNTS, touchdown: 5, casualty: 9 },
        },
      ],
    });
  });

  it('keeps the career counts of whichever repeated entry has them', async () => {
    sppAdjustments.syncReportedAdjustments.mockResolvedValue({
      updatedPlayerIds: [1],
    });

    await service.settle([
      { playerId: 1, reportedSppTotal: 12 },
      { playerId: 1, reportedSppTotal: 12, careerCounts: COUNTS },
    ]);

    expect(sppAdjustments.syncReportedAdjustments).toHaveBeenCalledWith({
      players: [{ playerId: 1, reportedSppTotal: 12, careerCounts: COUNTS }],
    });
  });

  it('keeps the unspent snapshot reported beside the higher total', async () => {
    sppAdjustments.syncReportedAdjustments.mockResolvedValue({
      updatedPlayerIds: [1],
    });
    const older = { unspentSpp: 2, snapshotSppTotal: 10 };
    const newer = { unspentSpp: 5, snapshotSppTotal: 14 };

    await service.settle([
      { playerId: 1, reportedSppTotal: 14, unspentSppSnapshot: newer },
      { playerId: 1, reportedSppTotal: 10, unspentSppSnapshot: older },
      { playerId: 1, reportedSppTotal: 14 },
    ]);

    expect(sppAdjustments.syncReportedAdjustments).toHaveBeenCalledWith({
      players: [
        { playerId: 1, reportedSppTotal: 14, unspentSppSnapshot: newer },
      ],
    });
  });

  describe('merging unspent snapshots of a repeated player', () => {
    const older = { unspentSpp: 2, snapshotSppTotal: 10 };
    const newer = { unspentSpp: 5, snapshotSppTotal: 14 };

    beforeEach(() => {
      sppAdjustments.syncReportedAdjustments.mockResolvedValue({
        updatedPlayerIds: [1],
      });
    });

    it('replaces a lower-total snapshot with a later, higher-total one', async () => {
      await service.settle([
        { playerId: 1, reportedSppTotal: 10, unspentSppSnapshot: older },
        { playerId: 1, reportedSppTotal: 14, unspentSppSnapshot: newer },
      ]);

      expect(sppAdjustments.syncReportedAdjustments).toHaveBeenCalledWith({
        players: [
          { playerId: 1, reportedSppTotal: 14, unspentSppSnapshot: newer },
        ],
      });
    });

    it('prefers the lower unspent figure at equal totals, in either order', async () => {
      const stale = { unspentSpp: 6, snapshotSppTotal: 20 };
      const fresh = { unspentSpp: 0, snapshotSppTotal: 20 };

      for (const order of [
        [stale, fresh],
        [fresh, stale],
      ]) {
        sppAdjustments.syncReportedAdjustments.mockClear();
        await service.settle(
          order.map((unspentSppSnapshot) => ({
            playerId: 1,
            reportedSppTotal: 20,
            unspentSppSnapshot,
          })),
        );

        expect(sppAdjustments.syncReportedAdjustments).toHaveBeenCalledWith({
          players: [
            { playerId: 1, reportedSppTotal: 20, unspentSppSnapshot: fresh },
          ],
        });
      }
    });

    it('lets the later entry win when totals and unspent figures are equal', async () => {
      const first = { unspentSpp: 3, snapshotSppTotal: 10 };
      const second = { unspentSpp: 3, snapshotSppTotal: 10 };

      await service.settle([
        { playerId: 1, reportedSppTotal: 10, unspentSppSnapshot: first },
        { playerId: 1, reportedSppTotal: 10, unspentSppSnapshot: second },
      ]);

      const [call] = sppAdjustments.syncReportedAdjustments.mock.calls[0];
      expect(call.players[0].unspentSppSnapshot).toBe(second);
    });

    it('keeps the higher total even with a higher unspent figure, in either order', async () => {
      const low = { unspentSpp: 0, snapshotSppTotal: 10 };
      const high = { unspentSpp: 8, snapshotSppTotal: 14 };

      for (const order of [
        [low, high],
        [high, low],
      ]) {
        sppAdjustments.syncReportedAdjustments.mockClear();
        await service.settle(
          order.map((unspentSppSnapshot) => ({
            playerId: 1,
            reportedSppTotal: unspentSppSnapshot.snapshotSppTotal,
            unspentSppSnapshot,
          })),
        );

        const [call] = sppAdjustments.syncReportedAdjustments.mock.calls[0];
        expect(call.players[0].unspentSppSnapshot).toBe(high);
      }
    });

    it('takes a snapshot from a later entry when the first had none', async () => {
      await service.settle([
        { playerId: 1, reportedSppTotal: 10 },
        { playerId: 1, reportedSppTotal: 10, unspentSppSnapshot: older },
      ]);

      expect(sppAdjustments.syncReportedAdjustments).toHaveBeenCalledWith({
        players: [
          { playerId: 1, reportedSppTotal: 10, unspentSppSnapshot: older },
        ],
      });
    });

    it('keeps a known snapshot when a later entry has none', async () => {
      await service.settle([
        { playerId: 1, reportedSppTotal: 10, unspentSppSnapshot: older },
        { playerId: 1, reportedSppTotal: 10 },
      ]);

      expect(sppAdjustments.syncReportedAdjustments).toHaveBeenCalledWith({
        players: [
          { playerId: 1, reportedSppTotal: 10, unspentSppSnapshot: older },
        ],
      });
    });
  });

  it('passes a player with no reported total through, for the sync to skip', async () => {
    sppAdjustments.syncReportedAdjustments.mockResolvedValue({
      updatedPlayerIds: [],
    });

    const result = await service.settle([
      { playerId: 1 },
      { playerId: 1, reportedSppTotal: undefined },
    ]);

    expect(sppAdjustments.syncReportedAdjustments).toHaveBeenCalledWith({
      players: [{ playerId: 1 }],
    });
    expect(result).toEqual({ success: true, imported: 0, errors: [] });
  });

  it('settles the players in chunks', async () => {
    sppAdjustments.syncReportedAdjustments
      .mockResolvedValueOnce({ updatedPlayerIds: [1, 2] })
      .mockResolvedValueOnce({ updatedPlayerIds: [3] });
    const players = Array.from(
      { length: SPP_ADJUSTMENTS_CHUNK_SIZE + 1 },
      (_, index) => ({ playerId: index + 1, reportedSppTotal: 1 }),
    );

    const result = await service.settle(players);

    const calls = sppAdjustments.syncReportedAdjustments.mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0].players).toHaveLength(SPP_ADJUSTMENTS_CHUNK_SIZE);
    expect(calls[1][0].players).toEqual([
      { playerId: SPP_ADJUSTMENTS_CHUNK_SIZE + 1, reportedSppTotal: 1 },
    ]);
    expect(result.imported).toBe(3);
  });

  it('records a failed chunk instead of throwing, and still settles the next one', async () => {
    sppAdjustments.syncReportedAdjustments
      .mockRejectedValueOnce(new Error('database down'))
      .mockResolvedValueOnce({ updatedPlayerIds: [501] });
    const players = Array.from(
      { length: SPP_ADJUSTMENTS_CHUNK_SIZE + 1 },
      (_, index) => ({ playerId: index + 1, reportedSppTotal: 1 }),
    );

    const result = await service.settle(players);

    expect(result.success).toBe(false);
    expect(result.imported).toBe(1);
    expect(result.errors).toEqual([
      {
        item: {
          playerIds: players
            .slice(0, SPP_ADJUSTMENTS_CHUNK_SIZE)
            .map((player) => player.playerId),
        },
        message: `Failed to settle the SPP adjustments of ${SPP_ADJUSTMENTS_CHUNK_SIZE} players: database down`,
      },
    ]);
  });
});
