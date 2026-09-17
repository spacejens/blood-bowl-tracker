import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { ImportRunnerService } from './import-runner.service';
import { stubImportRunner } from './import-runner.test-helpers';
import { SkillRulesSetsImportService } from './skill-rules-sets-import.service';
import type { ImportError } from './types';

describe('SkillRulesSetsImportService', () => {
  let service: SkillRulesSetsImportService;
  let client: DeepMockProxy<ApiClient>;
  let runner: MockProxy<ImportRunnerService>;

  beforeEach(async () => {
    client = mockDeep<ApiClient>();
    runner = mock<ImportRunnerService>();
    stubImportRunner(runner);
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

  it('returns the result and calls the client on success', async () => {
    client.skillRulesSets.sync.mockResolvedValue({ skillRulesSetIds: [21] });
    const errors: ImportError[] = [];

    const result = await service.syncSkillRulesSets(data, errors);

    expect(result).toEqual({ skillRulesSetIds: [21] });
    expect(client.skillRulesSets.sync).toHaveBeenCalledWith(data);
    expect(errors).toHaveLength(0);
  });

  it('records an error when the sync fails', async () => {
    client.skillRulesSets.sync.mockRejectedValue(new Error('boom'));
    const errors: ImportError[] = [];

    const result = await service.syncSkillRulesSets(data, errors);

    expect(result).toBeUndefined();
    expect(errors).toEqual([
      {
        item: data,
        message: 'Failed to sync 1 skill/rules-set pair(s): boom',
      },
    ]);
  });

  it('records an error using String(err) for a non-Error rejection', async () => {
    client.skillRulesSets.sync.mockRejectedValue('nope');
    const errors: ImportError[] = [];

    await service.syncSkillRulesSets(data, errors);

    expect(errors[0].message).toBe(
      'Failed to sync 1 skill/rules-set pair(s): nope',
    );
  });

  describe('listSkillRulesSets', () => {
    const rows = [
      { rulesSetId: 900, category: 'general' as const, isElite: false },
    ];

    it("returns the skill's categories on success", async () => {
      client.skillRulesSets.list.mockResolvedValue(rows);
      const errors: ImportError[] = [];

      const result = await service.listSkillRulesSets(42, errors);

      expect(client.skillRulesSets.list).toHaveBeenCalledWith({ skillId: 42 });
      expect(result).toEqual(rows);
      expect(errors).toEqual([]);
    });

    it('records an error and returns undefined when the read fails', async () => {
      client.skillRulesSets.list.mockRejectedValue(new Error('boom'));
      const errors: ImportError[] = [];

      const result = await service.listSkillRulesSets(42, errors);

      expect(result).toBeUndefined();
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('42');
      expect(errors[0].message).toContain('boom');
    });
  });
});
