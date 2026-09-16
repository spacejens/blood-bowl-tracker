import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { ImportRunnerService } from './import-runner.service';
import { stubImportRunner } from './import-runner.test-helpers';
import { PositionRulesSetSkillsImportService } from './position-rules-set-skills-import.service';
import type { ImportError } from './types';

describe('PositionRulesSetSkillsImportService', () => {
  let service: PositionRulesSetSkillsImportService;
  let client: DeepMockProxy<ApiClient>;
  let runner: MockProxy<ImportRunnerService>;

  beforeEach(async () => {
    client = mockDeep<ApiClient>();
    runner = mock<ImportRunnerService>();
    stubImportRunner(runner);
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

  it('returns the result and calls the client on success', async () => {
    client.positionRulesSetSkills.sync.mockResolvedValue({
      positionRulesSetSkillIds: [21],
    });
    const errors: ImportError[] = [];

    const result = await service.syncPositionRulesSetSkills(data, errors);

    expect(result).toEqual({ positionRulesSetSkillIds: [21] });
    expect(client.positionRulesSetSkills.sync).toHaveBeenCalledWith(data);
    expect(errors).toHaveLength(0);
  });

  it('records an error when the sync fails', async () => {
    client.positionRulesSetSkills.sync.mockRejectedValue(new Error('boom'));
    const errors: ImportError[] = [];

    const result = await service.syncPositionRulesSetSkills(data, errors);

    expect(result).toBeUndefined();
    expect(errors).toEqual([
      {
        item: data,
        message: 'Failed to sync 1 starting skill(s): boom',
      },
    ]);
  });

  it('records an error using String(err) for a non-Error rejection', async () => {
    client.positionRulesSetSkills.sync.mockRejectedValue('nope');
    const errors: ImportError[] = [];

    await service.syncPositionRulesSetSkills(data, errors);

    expect(errors[0].message).toBe('Failed to sync 1 starting skill(s): nope');
  });

  describe('listPositionRulesSetSkills', () => {
    const rows = [{ rulesSetId: 900, skillId: 5, attributeValue: null }];

    it("returns the position's starting skills on success", async () => {
      client.positionRulesSetSkills.list.mockResolvedValue(rows);
      const errors: ImportError[] = [];

      const result = await service.listPositionRulesSetSkills(42, errors);

      expect(client.positionRulesSetSkills.list).toHaveBeenCalledWith({
        positionId: 42,
      });
      expect(result).toEqual(rows);
      expect(errors).toEqual([]);
    });

    it('records an error and returns undefined when the read fails', async () => {
      client.positionRulesSetSkills.list.mockRejectedValue(new Error('boom'));
      const errors: ImportError[] = [];

      const result = await service.listPositionRulesSetSkills(42, errors);

      expect(result).toBeUndefined();
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('42');
      expect(errors[0].message).toContain('boom');
    });

    it('records an error using String(err) for a non-Error rejection', async () => {
      client.positionRulesSetSkills.list.mockRejectedValue('nope');
      const errors: ImportError[] = [];

      const result = await service.listPositionRulesSetSkills(42, errors);

      expect(result).toBeUndefined();
      expect(errors[0].message).toContain('nope');
    });
  });
});
