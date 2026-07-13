import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { describe, expect, it, vi } from 'vitest';

import { ImportRunnerService } from './import-runner.service';
import { MatchEventsImportService } from './match-events-import.service';
import type { ImportError } from './types';

describe('MatchEventsImportService', () => {
  function makeService(upsertMock: ReturnType<typeof vi.fn>) {
    const client = {
      matchEvents: { upsert: upsertMock },
    } as unknown as ApiClient;
    return new MatchEventsImportService(client, new ImportRunnerService());
  }

  const data = {
    matchId: 10,
    actingTeamEraId: 500,
    actingPlayerId: 9,
    actionType: 'touchdown' as const,
    externalIds: [{ externalSystemId: 1, externalId: '1000-vor-td-0' }],
  };

  it('returns true and calls the client on success', async () => {
    const upsertMock = vi.fn().mockResolvedValue({ id: 1, created: true });
    const service = makeService(upsertMock);
    const errors: ImportError[] = [];

    const result = await service.upsertMatchEvent(data, errors);

    expect(result).toBe(true);
    expect(upsertMock).toHaveBeenCalledWith(data);
    expect(errors).toHaveLength(0);
  });

  it('returns false and records an error on failure', async () => {
    const upsertMock = vi.fn().mockRejectedValue(new Error('conflict'));
    const service = makeService(upsertMock);
    const errors: ImportError[] = [];

    const result = await service.upsertMatchEvent(data, errors);

    expect(result).toBe(false);
    expect(errors).toEqual([
      {
        item: data,
        message: 'Failed to import match event "1000-vor-td-0": conflict',
      },
    ]);
  });

  it('records an error using String(err) for a non-Error rejection', async () => {
    const upsertMock = vi.fn().mockRejectedValue('boom');
    const service = makeService(upsertMock);
    const errors: ImportError[] = [];

    const result = await service.upsertMatchEvent(data, errors);

    expect(result).toBe(false);
    expect(errors).toEqual([
      {
        item: data,
        message: 'Failed to import match event "1000-vor-td-0": boom',
      },
    ]);
  });
});
