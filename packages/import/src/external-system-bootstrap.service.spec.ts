import { describe, expect, it, vi } from 'vitest';

import { ExternalSystemBootstrapService } from './external-system-bootstrap.service';
import type { ExternalSystemsImportService } from './external-systems-import.service';

function makeService(upsertExternalSystem: ReturnType<typeof vi.fn>) {
  return new ExternalSystemBootstrapService({
    upsertExternalSystem,
  } as unknown as ExternalSystemsImportService);
}

describe('ExternalSystemBootstrapService', () => {
  it('upserts every name and returns ok with the ids in the same order', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const service = makeService(upsertExternalSystem);

    await expect(service.bootstrap(['BBL', 'Name'])).resolves.toEqual({
      ok: true,
      ids: [1, 2],
    });
    expect(upsertExternalSystem).toHaveBeenNthCalledWith(1, 'BBL');
    expect(upsertExternalSystem).toHaveBeenNthCalledWith(2, 'Name');
  });

  it('returns a not-ok result recording the names and message on failure', async () => {
    const service = makeService(
      vi.fn().mockRejectedValue(new Error('api down')),
    );

    await expect(service.bootstrap(['BBL', 'Name'])).resolves.toEqual({
      ok: false,
      error: {
        item: { externalSystems: ['BBL', 'Name'] },
        message: 'api down',
      },
    });
  });

  it('applies a caller-supplied prefix to the failure message', async () => {
    const service = makeService(
      vi.fn().mockRejectedValue(new Error('api down')),
    );

    await expect(
      service.bootstrap(['BBL'], 'Failed to upsert external system: '),
    ).resolves.toEqual({
      ok: false,
      error: {
        item: { externalSystems: ['BBL'] },
        message: 'Failed to upsert external system: api down',
      },
    });
  });

  it('stringifies a non-Error throw', async () => {
    const service = makeService(vi.fn().mockRejectedValue('weird'));

    await expect(service.bootstrap(['BBL'])).resolves.toEqual({
      ok: false,
      error: { item: { externalSystems: ['BBL'] }, message: 'weird' },
    });
  });
});
