import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { ImportRunnerService } from './import-runner.service';
import { recordUpsertResultOptions } from './import-runner.test-helpers';
import { SppAdjustmentsImportService } from './spp-adjustments-import.service';
import type { ImportError } from './types';

describe('SppAdjustmentsImportService', () => {
  let service: SppAdjustmentsImportService;
  let client: DeepMockProxy<ApiClient>;
  let runner: MockProxy<ImportRunnerService>;
  let errors: ImportError[];

  beforeEach(async () => {
    client = mockDeep<ApiClient>();
    runner = mock<ImportRunnerService>();
    errors = [];
    const moduleRef = await Test.createTestingModule({
      providers: [
        SppAdjustmentsImportService,
        { provide: API_CLIENT, useValue: client },
        { provide: ImportRunnerService, useValue: runner },
      ],
    }).compile();
    service = moduleRef.get(SppAdjustmentsImportService);
  });

  describe('syncScrapedSppAdjustments', () => {
    const data = {
      players: [
        { playerId: 1, scrapedTotal: 16 },
        { playerId: 2, scrapedTotal: null },
      ],
    };

    it('returns the runner result unchanged', async () => {
      const synced = { updatedPlayerIds: [1] };
      runner.recordUpsertResult.mockResolvedValue(synced);

      const result = await service.syncScrapedSppAdjustments(data, errors);

      expect(result).toBe(synced);
    });

    it('returns undefined when the runner recorded a failure', async () => {
      runner.recordUpsertResult.mockResolvedValue(undefined);

      const result = await service.syncScrapedSppAdjustments(data, errors);

      expect(result).toBeUndefined();
    });

    it('hands the runner the data as item, the caller error list, and an upsert that calls the client', async () => {
      runner.recordUpsertResult.mockResolvedValue(undefined);
      client.players.syncScrapedSppAdjustments.mockResolvedValue({
        updatedPlayerIds: [1],
      });

      await service.syncScrapedSppAdjustments(data, errors);

      const options = recordUpsertResultOptions(runner);
      expect(options.item).toBe(data);
      expect(options.errors).toBe(errors);
      await expect(options.upsert()).resolves.toEqual({
        updatedPlayerIds: [1],
      });
      expect(client.players.syncScrapedSppAdjustments).toHaveBeenCalledWith(
        data,
      );
    });

    it('builds a failure message naming the batch size', async () => {
      runner.recordUpsertResult.mockResolvedValue(undefined);

      await service.syncScrapedSppAdjustments(data, errors);

      const { buildErrorMessage } = recordUpsertResultOptions(runner);
      expect(buildErrorMessage(new Error('boom'))).toBe(
        'Failed to sync scraped SPP adjustments for 2 player(s): boom',
      );
      expect(buildErrorMessage('nope')).toBe(
        'Failed to sync scraped SPP adjustments for 2 player(s): nope',
      );
    });
  });

  describe('syncReportedSppAdjustments', () => {
    const data = { players: [{ playerId: 3 }, { playerId: 4 }] };

    it('returns the runner result unchanged', async () => {
      const synced = { updatedPlayerIds: [2] };
      runner.recordUpsertResult.mockResolvedValue(synced);

      const result = await service.syncReportedSppAdjustments(data, errors);

      expect(result).toBe(synced);
    });

    it('returns undefined when the runner recorded a failure', async () => {
      runner.recordUpsertResult.mockResolvedValue(undefined);

      const result = await service.syncReportedSppAdjustments(data, errors);

      expect(result).toBeUndefined();
    });

    it('hands the runner the data as item, the caller error list, and an upsert that calls the client', async () => {
      runner.recordUpsertResult.mockResolvedValue(undefined);
      client.players.syncReportedSppAdjustments.mockResolvedValue({
        updatedPlayerIds: [2],
      });

      await service.syncReportedSppAdjustments(data, errors);

      const options = recordUpsertResultOptions(runner);
      expect(options.item).toBe(data);
      expect(options.errors).toBe(errors);
      await expect(options.upsert()).resolves.toEqual({
        updatedPlayerIds: [2],
      });
      expect(client.players.syncReportedSppAdjustments).toHaveBeenCalledWith(
        data,
      );
    });

    it('builds a failure message naming the batch size', async () => {
      runner.recordUpsertResult.mockResolvedValue(undefined);

      await service.syncReportedSppAdjustments(data, errors);

      const { buildErrorMessage } = recordUpsertResultOptions(runner);
      expect(buildErrorMessage(new Error('boom'))).toBe(
        'Failed to sync reported SPP adjustments for 2 player(s): boom',
      );
      expect(buildErrorMessage('nope')).toBe(
        'Failed to sync reported SPP adjustments for 2 player(s): nope',
      );
    });
  });
});
