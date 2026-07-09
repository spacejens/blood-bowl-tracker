import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { describe, expect, it, vi } from 'vitest';

import { ImportRunnerService } from './import-runner.service';
import { RulesSetsImportService } from './rules-sets-import.service';
import type { ImportError } from './types';

describe('RulesSetsImportService', () => {
  function makeService(upsertMock: ReturnType<typeof vi.fn>) {
    const client = {
      rulesSets: { upsert: upsertMock },
    } as unknown as ApiClient;
    return new RulesSetsImportService(client, new ImportRunnerService());
  }

  it('returns the upserted rules set and calls the client with the given data', async () => {
    const response = {
      id: 1,
      name: 'BB2020',
      createdAt: new Date('2026-01-01'),
      created: true,
    };
    const upsertMock = vi.fn().mockResolvedValue(response);
    const service = makeService(upsertMock);
    const errors: ImportError[] = [];
    const data = {
      name: 'BB2020',
      externalIds: [{ externalSystemId: 1, externalId: 'BB2020' }],
    };

    const result = await service.upsertRulesSet(data, errors);

    expect(result).toEqual(response);
    expect(upsertMock).toHaveBeenCalledWith(data);
    expect(errors).toHaveLength(0);
  });

  it('returns undefined and records an error when the client call fails', async () => {
    const upsertMock = vi.fn().mockRejectedValue(new Error('conflict'));
    const service = makeService(upsertMock);
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
    const upsertMock = vi.fn().mockRejectedValue('boom');
    const service = makeService(upsertMock);
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
