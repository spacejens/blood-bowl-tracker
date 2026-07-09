import { describe, expect, it } from 'vitest';

import { ImportRunnerService } from './import-runner.service';
import type { ImportError } from './types';

describe('ImportRunnerService', () => {
  describe('upsertExternalSystem', () => {
    it('returns the external system id on success', async () => {
      const service = new ImportRunnerService();
      const id = await service.upsertExternalSystem(
        () => Promise.resolve({ id: 7 }),
        'BBL',
      );
      expect(id).toBe(7);
    });

    it('throws a descriptive error when the upsert call fails', async () => {
      const service = new ImportRunnerService();
      await expect(
        service.upsertExternalSystem(
          () => Promise.reject(new Error('internal error')),
          'BBL',
        ),
      ).rejects.toThrow(
        'Failed to upsert external system "BBL": internal error',
      );
    });

    it('throws a descriptive error when the upsert call rejects with a non-Error value', async () => {
      const service = new ImportRunnerService();
      await expect(
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- verifying non-Error rejection handling
        service.upsertExternalSystem(() => Promise.reject('boom'), 'BBL'),
      ).rejects.toThrow('Failed to upsert external system "BBL": boom');
    });
  });

  describe('recordUpsert', () => {
    it('returns true and records no error on success', async () => {
      const service = new ImportRunnerService();
      const errors: ImportError[] = [];
      const result = await service.recordUpsert(
        () => Promise.resolve({ id: 1 }),
        { id: 1 },
        errors,
        () => 'unused',
      );
      expect(result).toBe(true);
      expect(errors).toHaveLength(0);
    });

    it('returns false and records an error built from the thrown error on failure', async () => {
      const service = new ImportRunnerService();
      const errors: ImportError[] = [];
      const item = { id: 2, name: 'Gruk' };
      const result = await service.recordUpsert(
        () => Promise.reject(new Error('conflict')),
        item,
        errors,
        (err) => `Failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      expect(result).toBe(false);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toEqual({ item, message: 'Failed: conflict' });
    });
  });
});
