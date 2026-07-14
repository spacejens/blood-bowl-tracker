import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { describe, expect, it, vi } from 'vitest';

import { ErasImportService } from './eras-import.service';
import { ImportRunnerService } from './import-runner.service';
import type { ImportError } from './types';

describe('ErasImportService', () => {
  function makeService(upsertMock: ReturnType<typeof vi.fn>) {
    const client = { eras: { upsert: upsertMock } } as unknown as ApiClient;
    return new ErasImportService(client, new ImportRunnerService());
  }

  const data = {
    name: 'BB2020',
    leagueId: 10,
    rulesSetIds: [20],
    startDate: '2021-09-01',
    endDate: '2023-06-10',
    externalIds: [{ externalSystemId: 1, externalId: 'BB2020' }],
  };

  it('returns the upserted era on success', async () => {
    const upsertMock = vi.fn().mockResolvedValue({
      id: 1,
      name: 'BB2020',
      leagueId: 10,
      rulesSetIds: [20],
      startDate: '2021-09-01',
      endDate: '2023-06-10',
      createdAt: new Date('2026-01-01'),
      created: true,
    });
    const service = makeService(upsertMock);
    const errors: ImportError[] = [];

    const result = await service.upsertEra(data, errors);

    expect(result).toEqual({
      id: 1,
      name: 'BB2020',
      leagueId: 10,
      rulesSetIds: [20],
      startDate: '2021-09-01',
      endDate: '2023-06-10',
      createdAt: new Date('2026-01-01'),
      created: true,
    });
    expect(upsertMock).toHaveBeenCalledWith(data);
    expect(errors).toHaveLength(0);
  });

  it('returns false and records an error when the client call fails', async () => {
    const upsertMock = vi.fn().mockRejectedValue(new Error('conflict'));
    const service = makeService(upsertMock);
    const errors: ImportError[] = [];

    const result = await service.upsertEra(data, errors);

    expect(result).toBeUndefined();
    expect(errors).toEqual([
      { item: data, message: 'Failed to import era "BB2020": conflict' },
    ]);
  });

  it('records an error using String(err) for a non-Error rejection', async () => {
    const upsertMock = vi.fn().mockRejectedValue('boom');
    const service = makeService(upsertMock);
    const errors: ImportError[] = [];

    const result = await service.upsertEra(data, errors);

    expect(result).toBeUndefined();
    expect(errors).toEqual([
      { item: data, message: 'Failed to import era "BB2020": boom' },
    ]);
  });
});
