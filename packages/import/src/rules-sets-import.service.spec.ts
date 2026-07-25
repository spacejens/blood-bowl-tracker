import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { ImportRunnerService } from './import-runner.service';
import { stubImportRunner } from './import-runner.test-helpers';
import { RulesSetsImportService } from './rules-sets-import.service';
import type { ImportError } from './types';

describe('RulesSetsImportService', () => {
  let service: RulesSetsImportService;
  let client: DeepMockProxy<ApiClient>;
  let runner: MockProxy<ImportRunnerService>;

  beforeEach(async () => {
    client = mockDeep<ApiClient>();
    runner = mock<ImportRunnerService>();
    stubImportRunner(runner);
    const moduleRef = await Test.createTestingModule({
      providers: [
        RulesSetsImportService,
        { provide: API_CLIENT, useValue: client },
        { provide: ImportRunnerService, useValue: runner },
      ],
    }).compile();
    service = moduleRef.get(RulesSetsImportService);
  });

  it('returns the upserted rules set and calls the client with the given data', async () => {
    const response = {
      id: 1,
      name: 'BB2020',
      createdAt: new Date('2026-01-01'),
      created: true,
    };
    client.rulesSets.upsert.mockResolvedValue(response);
    const errors: ImportError[] = [];
    const data = {
      name: 'BB2020',
      externalIds: [{ externalSystemId: 1, externalId: 'BB2020' }],
    };

    const result = await service.upsertRulesSet(data, errors);

    expect(result).toEqual(response);
    expect(client.rulesSets.upsert).toHaveBeenCalledWith(data);
    expect(errors).toHaveLength(0);
  });

  it('returns undefined and records an error when the client call fails', async () => {
    client.rulesSets.upsert.mockRejectedValue(new Error('conflict'));
    const errors: ImportError[] = [];
    const data = {
      name: 'BB2020',
      externalIds: [{ externalSystemId: 1, externalId: 'BB2020' }],
    };

    const result = await service.upsertRulesSet(data, errors);

    expect(result).toBeUndefined();
    expect(errors).toEqual([
      { item: data, message: 'Failed to import rules set "BB2020": conflict' },
    ]);
  });

  it('records an error using String(err) for a non-Error rejection', async () => {
    client.rulesSets.upsert.mockRejectedValue('boom');
    const errors: ImportError[] = [];
    const data = {
      name: 'BB2020',
      externalIds: [{ externalSystemId: 1, externalId: 'BB2020' }],
    };

    const result = await service.upsertRulesSet(data, errors);

    expect(result).toBeUndefined();
    expect(errors).toEqual([
      { item: data, message: 'Failed to import rules set "BB2020": boom' },
    ]);
  });
});
