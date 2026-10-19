import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { ImportRunnerService } from './import-runner.service';
import { recordUpsertResultOptions } from './import-runner.test-helpers';
import { SkillRulesSetsImportService } from './skill-rules-sets-import.service';
import type { ImportError } from './types';

describe('SkillRulesSetsImportService', () => {
  let service: SkillRulesSetsImportService;
  let client: DeepMockProxy<ApiClient>;
  let runner: MockProxy<ImportRunnerService>;

  beforeEach(async () => {
    client = mockDeep<ApiClient>();
    runner = mock<ImportRunnerService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        SkillRulesSetsImportService,
        { provide: API_CLIENT, useValue: client },
        { provide: ImportRunnerService, useValue: runner },
      ],
    }).compile();
    service = moduleRef.get(SkillRulesSetsImportService);
  });

  const data = {
    entries: [
      {
        skillId: 3,
        rulesSetId: 4,
        category: 'agility' as const,
        isElite: false,
      },
    ],
  };

  describe('syncSkillRulesSets', () => {
    it('returns the runner result unchanged', async () => {
      const synced = { skillRulesSetIds: [21] };
      runner.recordUpsertResult.mockResolvedValue(synced);

      const result = await service.syncSkillRulesSets(data, []);

      expect(result).toBe(synced);
    });

    it('returns undefined when the runner recorded a failure', async () => {
      runner.recordUpsertResult.mockResolvedValue(undefined);

      const result = await service.syncSkillRulesSets(data, []);

      expect(result).toBeUndefined();
    });

    it('hands the runner the data as item, the caller error list, and an upsert that calls the client', async () => {
      runner.recordUpsertResult.mockResolvedValue(undefined);
      client.skillRulesSets.sync.mockResolvedValue({ skillRulesSetIds: [21] });
      const errors: ImportError[] = [];

      await service.syncSkillRulesSets(data, errors);

      const options = recordUpsertResultOptions(runner);
      expect(options.item).toBe(data);
      expect(options.errors).toBe(errors);
      await expect(options.upsert()).resolves.toEqual({
        skillRulesSetIds: [21],
      });
      expect(client.skillRulesSets.sync).toHaveBeenCalledWith(data);
    });

    it('builds a failure message naming the entry count', async () => {
      runner.recordUpsertResult.mockResolvedValue(undefined);

      await service.syncSkillRulesSets(data, []);

      const { buildErrorMessage } = recordUpsertResultOptions(runner);
      expect(buildErrorMessage(new Error('boom'))).toBe(
        'Failed to sync 1 skill/rules-set pair(s): boom',
      );
      expect(buildErrorMessage('nope')).toBe(
        'Failed to sync 1 skill/rules-set pair(s): nope',
      );
    });
  });

  describe('listSkillRulesSets', () => {
    const rows = [
      { rulesSetId: 900, category: 'general' as const, isElite: false },
    ];

    it('returns the runner result unchanged', async () => {
      runner.recordUpsertResult.mockResolvedValue(rows);

      const result = await service.listSkillRulesSets(42, []);

      expect(result).toBe(rows);
    });

    it('returns undefined when the runner recorded a failure', async () => {
      runner.recordUpsertResult.mockResolvedValue(undefined);

      const result = await service.listSkillRulesSets(42, []);

      expect(result).toBeUndefined();
    });

    it('hands the runner the id as item, the caller error list, and an upsert that calls the client', async () => {
      runner.recordUpsertResult.mockResolvedValue(undefined);
      client.skillRulesSets.list.mockResolvedValue(rows);
      const errors: ImportError[] = [];

      await service.listSkillRulesSets(42, errors);

      const options = recordUpsertResultOptions(runner);
      expect(options.item).toEqual({ skillRulesSets: 42 });
      expect(options.errors).toBe(errors);
      await expect(options.upsert()).resolves.toBe(rows);
      expect(client.skillRulesSets.list).toHaveBeenCalledWith({ skillId: 42 });
    });

    it('builds a failure message naming the id', async () => {
      runner.recordUpsertResult.mockResolvedValue(undefined);

      await service.listSkillRulesSets(42, []);

      const { buildErrorMessage } = recordUpsertResultOptions(runner);
      expect(buildErrorMessage(new Error('boom'))).toBe(
        'Failed to list categories for skill 42: boom',
      );
      expect(buildErrorMessage('nope')).toBe(
        'Failed to list categories for skill 42: nope',
      );
    });
  });
});
