import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { ImportRunnerService } from './import-runner.service';
import { recordUpsertResultOptions } from './import-runner.test-helpers';
import { PositionRulesSetSkillsImportService } from './position-rules-set-skills-import.service';
import type { ImportError } from './types';

describe('PositionRulesSetSkillsImportService', () => {
  let service: PositionRulesSetSkillsImportService;
  let client: DeepMockProxy<ApiClient>;
  let runner: MockProxy<ImportRunnerService>;

  beforeEach(async () => {
    client = mockDeep<ApiClient>();
    runner = mock<ImportRunnerService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PositionRulesSetSkillsImportService,
        { provide: API_CLIENT, useValue: client },
        { provide: ImportRunnerService, useValue: runner },
      ],
    }).compile();
    service = moduleRef.get(PositionRulesSetSkillsImportService);
  });

  const data = {
    entries: [{ positionId: 3, rulesSetId: 4, skillId: 5 }],
  };

  describe('syncPositionRulesSetSkills', () => {
    it('returns the runner result unchanged', async () => {
      const synced = { positionRulesSetSkillIds: [21] };
      runner.recordUpsertResult.mockResolvedValue(synced);

      const result = await service.syncPositionRulesSetSkills(data, []);

      expect(result).toBe(synced);
    });

    it('returns undefined when the runner recorded a failure', async () => {
      runner.recordUpsertResult.mockResolvedValue(undefined);

      const result = await service.syncPositionRulesSetSkills(data, []);

      expect(result).toBeUndefined();
    });

    it('hands the runner the data as item, the caller error list, and an upsert that calls the client', async () => {
      runner.recordUpsertResult.mockResolvedValue(undefined);
      client.positionRulesSetSkills.sync.mockResolvedValue({
        positionRulesSetSkillIds: [21],
      });
      const errors: ImportError[] = [];

      await service.syncPositionRulesSetSkills(data, errors);

      const options = recordUpsertResultOptions(runner);
      expect(options.item).toBe(data);
      expect(options.errors).toBe(errors);
      await expect(options.upsert()).resolves.toEqual({
        positionRulesSetSkillIds: [21],
      });
      expect(client.positionRulesSetSkills.sync).toHaveBeenCalledWith(data);
    });

    it('builds a failure message naming the entry count', async () => {
      runner.recordUpsertResult.mockResolvedValue(undefined);

      await service.syncPositionRulesSetSkills(data, []);

      const { buildErrorMessage } = recordUpsertResultOptions(runner);
      expect(buildErrorMessage(new Error('boom'))).toBe(
        'Failed to sync 1 starting skill(s): boom',
      );
      expect(buildErrorMessage('nope')).toBe(
        'Failed to sync 1 starting skill(s): nope',
      );
    });
  });

  describe('listPositionRulesSetSkills', () => {
    const rows = [{ rulesSetId: 900, skillId: 5, attributeValue: null }];

    it('returns the runner result unchanged', async () => {
      runner.recordUpsertResult.mockResolvedValue(rows);

      const result = await service.listPositionRulesSetSkills(42, []);

      expect(result).toBe(rows);
    });

    it('returns undefined when the runner recorded a failure', async () => {
      runner.recordUpsertResult.mockResolvedValue(undefined);

      const result = await service.listPositionRulesSetSkills(42, []);

      expect(result).toBeUndefined();
    });

    it('hands the runner the id as item, the caller error list, and an upsert that calls the client', async () => {
      runner.recordUpsertResult.mockResolvedValue(undefined);
      client.positionRulesSetSkills.list.mockResolvedValue(rows);
      const errors: ImportError[] = [];

      await service.listPositionRulesSetSkills(42, errors);

      const options = recordUpsertResultOptions(runner);
      expect(options.item).toEqual({ positionRulesSetSkills: 42 });
      expect(options.errors).toBe(errors);
      await expect(options.upsert()).resolves.toBe(rows);
      expect(client.positionRulesSetSkills.list).toHaveBeenCalledWith({
        positionId: 42,
      });
    });

    it('builds a failure message naming the id', async () => {
      runner.recordUpsertResult.mockResolvedValue(undefined);

      await service.listPositionRulesSetSkills(42, []);

      const { buildErrorMessage } = recordUpsertResultOptions(runner);
      expect(buildErrorMessage(new Error('boom'))).toBe(
        'Failed to list starting skills for position 42: boom',
      );
      expect(buildErrorMessage('nope')).toBe(
        'Failed to list starting skills for position 42: nope',
      );
    });
  });
});
