import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { ImportRunnerService } from './import-runner.service';
import { stubImportRunner } from './import-runner.test-helpers';
import { PositionRulesSetKeywordsImportService } from './position-rules-set-keywords-import.service';
import type { ImportError } from './types';

describe('PositionRulesSetKeywordsImportService', () => {
  let service: PositionRulesSetKeywordsImportService;
  let client: DeepMockProxy<ApiClient>;
  let runner: MockProxy<ImportRunnerService>;

  beforeEach(async () => {
    client = mockDeep<ApiClient>();
    runner = mock<ImportRunnerService>();
    stubImportRunner(runner);
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

  it('syncs position keywords', async () => {
    client.positionRulesSetKeywords.sync.mockResolvedValue({
      positionRulesSetKeywordIds: [21],
    });
    const errors: ImportError[] = [];

    const result = await service.syncPositionRulesSetKeywords(data, errors);

    expect(result).toEqual({ positionRulesSetKeywordIds: [21] });
    expect(client.positionRulesSetKeywords.sync).toHaveBeenCalledWith(data);
    expect(errors).toHaveLength(0);
  });

  it('records an error naming the entry count when a sync fails', async () => {
    client.positionRulesSetKeywords.sync.mockRejectedValue(new Error('boom'));
    const errors: ImportError[] = [];

    const result = await service.syncPositionRulesSetKeywords(data, errors);

    expect(result).toBeUndefined();
    expect(errors).toEqual([
      {
        item: data,
        message: 'Failed to sync 1 position keyword(s): boom',
      },
    ]);
  });

  it('records an error using String(err) for a non-Error rejection', async () => {
    client.positionRulesSetKeywords.sync.mockRejectedValue('nope');
    const errors: ImportError[] = [];

    await service.syncPositionRulesSetKeywords(data, errors);

    expect(errors[0].message).toBe(
      'Failed to sync 1 position keyword(s): nope',
    );
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

    it("returns the position's keywords on success", async () => {
      client.positionRulesSetKeywords.list.mockResolvedValue(rows);
      const errors: ImportError[] = [];

      const result = await service.listPositionRulesSetKeywords(42, errors);

      expect(client.positionRulesSetKeywords.list).toHaveBeenCalledWith({
        positionId: 42,
      });
      expect(result).toEqual(rows);
      expect(errors).toEqual([]);
    });

    it('records an error and returns undefined when the read fails', async () => {
      client.positionRulesSetKeywords.list.mockRejectedValue(new Error('boom'));
      const errors: ImportError[] = [];

      const result = await service.listPositionRulesSetKeywords(42, errors);

      expect(result).toBeUndefined();
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('42');
      expect(errors[0].message).toContain('boom');
    });

    it('records an error using String(err) for a non-Error rejection', async () => {
      client.positionRulesSetKeywords.list.mockRejectedValue('nope');
      const errors: ImportError[] = [];

      const result = await service.listPositionRulesSetKeywords(42, errors);

      expect(result).toBeUndefined();
      expect(errors[0].message).toContain('nope');
    });
  });
});
