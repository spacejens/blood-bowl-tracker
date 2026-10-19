import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { ImportRunnerService } from './import-runner.service';
import { recordUpsertResultOptions } from './import-runner.test-helpers';
import { PositionRulesSetKeywordsImportService } from './position-rules-set-keywords-import.service';
import type { ImportError } from './types';

describe('PositionRulesSetKeywordsImportService', () => {
  let service: PositionRulesSetKeywordsImportService;
  let client: DeepMockProxy<ApiClient>;
  let runner: MockProxy<ImportRunnerService>;

  beforeEach(async () => {
    client = mockDeep<ApiClient>();
    runner = mock<ImportRunnerService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PositionRulesSetKeywordsImportService,
        { provide: API_CLIENT, useValue: client },
        { provide: ImportRunnerService, useValue: runner },
      ],
    }).compile();
    service = moduleRef.get(PositionRulesSetKeywordsImportService);
  });

  const data = {
    entries: [{ positionId: 3, rulesSetId: 4, keywordId: 7 }],
  };

  describe('syncPositionRulesSetKeywords', () => {
    it('returns the runner result unchanged', async () => {
      const synced = { positionRulesSetKeywordIds: [21] };
      runner.recordUpsertResult.mockResolvedValue(synced);

      const result = await service.syncPositionRulesSetKeywords(data, []);

      expect(result).toBe(synced);
    });

    it('returns undefined when the runner recorded a failure', async () => {
      runner.recordUpsertResult.mockResolvedValue(undefined);

      const result = await service.syncPositionRulesSetKeywords(data, []);

      expect(result).toBeUndefined();
    });

    it('hands the runner the data as item, the caller error list, and an upsert that calls the client', async () => {
      runner.recordUpsertResult.mockResolvedValue(undefined);
      client.positionRulesSetKeywords.sync.mockResolvedValue({
        positionRulesSetKeywordIds: [21],
      });
      const errors: ImportError[] = [];

      await service.syncPositionRulesSetKeywords(data, errors);

      const options = recordUpsertResultOptions(runner);
      expect(options.item).toBe(data);
      expect(options.errors).toBe(errors);
      await expect(options.upsert()).resolves.toEqual({
        positionRulesSetKeywordIds: [21],
      });
      expect(client.positionRulesSetKeywords.sync).toHaveBeenCalledWith(data);
    });

    it('builds a failure message naming the entry count', async () => {
      runner.recordUpsertResult.mockResolvedValue(undefined);

      await service.syncPositionRulesSetKeywords(data, []);

      const { buildErrorMessage } = recordUpsertResultOptions(runner);
      expect(buildErrorMessage(new Error('boom'))).toBe(
        'Failed to sync 1 position keyword(s): boom',
      );
      expect(buildErrorMessage('nope')).toBe(
        'Failed to sync 1 position keyword(s): nope',
      );
    });
  });

  describe('listPositionRulesSetKeywords', () => {
    const rows = [
      {
        rulesSetId: 900,
        keywordId: 7,
        keywordName: 'Goblin',
        kind: 'species' as const,
      },
    ];

    it('returns the runner result unchanged', async () => {
      runner.recordUpsertResult.mockResolvedValue(rows);

      const result = await service.listPositionRulesSetKeywords(42, []);

      expect(result).toBe(rows);
    });

    it('returns undefined when the runner recorded a failure', async () => {
      runner.recordUpsertResult.mockResolvedValue(undefined);

      const result = await service.listPositionRulesSetKeywords(42, []);

      expect(result).toBeUndefined();
    });

    it('hands the runner the id as item, the caller error list, and an upsert that calls the client', async () => {
      runner.recordUpsertResult.mockResolvedValue(undefined);
      client.positionRulesSetKeywords.list.mockResolvedValue(rows);
      const errors: ImportError[] = [];

      await service.listPositionRulesSetKeywords(42, errors);

      const options = recordUpsertResultOptions(runner);
      expect(options.item).toEqual({ positionId: 42 });
      expect(options.errors).toBe(errors);
      await expect(options.upsert()).resolves.toBe(rows);
      expect(client.positionRulesSetKeywords.list).toHaveBeenCalledWith({
        positionId: 42,
      });
    });

    it('builds a failure message naming the id', async () => {
      runner.recordUpsertResult.mockResolvedValue(undefined);

      await service.listPositionRulesSetKeywords(42, []);

      const { buildErrorMessage } = recordUpsertResultOptions(runner);
      expect(buildErrorMessage(new Error('boom'))).toBe(
        "Failed to read position 42's keywords: boom",
      );
      expect(buildErrorMessage('nope')).toBe(
        "Failed to read position 42's keywords: nope",
      );
    });
  });
});
