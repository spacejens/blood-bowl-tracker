import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { ImportRunnerService } from './import-runner.service';
import { recordUpsertResultOptions } from './import-runner.test-helpers';
import { PositionRulesSetSkillCategoriesImportService } from './position-rules-set-skill-categories-import.service';
import type { ImportError } from './types';

describe('PositionRulesSetSkillCategoriesImportService', () => {
  let service: PositionRulesSetSkillCategoriesImportService;
  let client: DeepMockProxy<ApiClient>;
  let runner: MockProxy<ImportRunnerService>;

  beforeEach(async () => {
    client = mockDeep<ApiClient>();
    runner = mock<ImportRunnerService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PositionRulesSetSkillCategoriesImportService,
        { provide: API_CLIENT, useValue: client },
        { provide: ImportRunnerService, useValue: runner },
      ],
    }).compile();
    service = moduleRef.get(PositionRulesSetSkillCategoriesImportService);
  });

  const data = {
    entries: [
      {
        positionId: 1,
        rulesSetId: 2,
        primary: ['general' as const],
        secondary: ['agility' as const],
      },
    ],
  };

  it('returns the runner result unchanged', async () => {
    const synced = { positionRulesSetSkillCategoryIds: [11] };
    runner.recordUpsertResult.mockResolvedValue(synced);

    const result = await service.syncPositionRulesSetSkillCategories(data, []);

    expect(result).toBe(synced);
  });

  it('returns undefined when the runner recorded a failure', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);

    const result = await service.syncPositionRulesSetSkillCategories(data, []);

    expect(result).toBeUndefined();
  });

  it('hands the runner the data as item, the caller error list, and an upsert that calls the client', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);
    client.positionRulesSetSkillCategories.sync.mockResolvedValue({
      positionRulesSetSkillCategoryIds: [11],
    });
    const errors: ImportError[] = [];

    await service.syncPositionRulesSetSkillCategories(data, errors);

    const options = recordUpsertResultOptions(runner);
    expect(options.item).toBe(data);
    expect(options.errors).toBe(errors);
    await expect(options.upsert()).resolves.toEqual({
      positionRulesSetSkillCategoryIds: [11],
    });
    expect(client.positionRulesSetSkillCategories.sync).toHaveBeenCalledWith(
      data,
    );
  });

  it('builds a failure message naming the number of positions', async () => {
    runner.recordUpsertResult.mockResolvedValue(undefined);

    await service.syncPositionRulesSetSkillCategories(data, []);

    const { buildErrorMessage } = recordUpsertResultOptions(runner);
    expect(buildErrorMessage(new Error('boom'))).toBe(
      'Failed to sync the skill categories of 1 position(s): boom',
    );
    expect(buildErrorMessage('nope')).toBe(
      'Failed to sync the skill categories of 1 position(s): nope',
    );
  });
});
