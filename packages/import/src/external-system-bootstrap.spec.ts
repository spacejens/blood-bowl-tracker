import { describe, expect, it, vi } from 'vitest';

import {
  externalSystemBootstrapError,
  upsertExternalSystems,
} from './external-system-bootstrap';
import type { ExternalSystemsImportService } from './external-systems-import.service';

describe('upsertExternalSystems', () => {
  it('upserts every name and returns the ids in the same order', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const service = {
      upsertExternalSystem,
    } as unknown as ExternalSystemsImportService;
    await expect(
      upsertExternalSystems(service, ['BBL', 'Name']),
    ).resolves.toEqual([1, 2]);
    expect(upsertExternalSystem).toHaveBeenNthCalledWith(1, 'BBL');
    expect(upsertExternalSystem).toHaveBeenNthCalledWith(2, 'Name');
  });

  it('propagates a failure so the caller can record it and bail', async () => {
    const boom = new Error('api down');
    const service = {
      upsertExternalSystem: vi.fn().mockRejectedValue(boom),
    } as unknown as ExternalSystemsImportService;
    await expect(upsertExternalSystems(service, ['BBL'])).rejects.toBe(boom);
  });
});

describe('externalSystemBootstrapError', () => {
  it('records the names and the error message', () => {
    expect(
      externalSystemBootstrapError(['BBL', 'Name'], new Error('api down')),
    ).toEqual({
      item: { externalSystems: ['BBL', 'Name'] },
      message: 'api down',
    });
  });

  it('applies a caller-supplied prefix', () => {
    expect(
      externalSystemBootstrapError(
        ['BBL'],
        new Error('api down'),
        'Failed to upsert external system: ',
      ),
    ).toEqual({
      item: { externalSystems: ['BBL'] },
      message: 'Failed to upsert external system: api down',
    });
  });

  it('stringifies a non-Error throw', () => {
    expect(externalSystemBootstrapError(['BBL'], 'weird')).toEqual({
      item: { externalSystems: ['BBL'] },
      message: 'weird',
    });
  });
});
