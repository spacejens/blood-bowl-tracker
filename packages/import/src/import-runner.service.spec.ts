import { describe, it, expect } from 'vitest';
import { ImportRunnerService } from './import-runner.service';
import type { ImportError } from './types';

describe('ImportRunnerService', () => {
  describe('upsertExternalSystem', () => {
    it('returns the external system id on a 200 response', async () => {
      const service = new ImportRunnerService();
      const id = await service.upsertExternalSystem(
        () => Promise.resolve({ status: 200, body: { id: 7 } }),
        'BBL',
      );
      expect(id).toBe(7);
    });

    it('returns the external system id on a 201 response', async () => {
      const service = new ImportRunnerService();
      const id = await service.upsertExternalSystem(
        () => Promise.resolve({ status: 201, body: { id: 3 } }),
        'BBL',
      );
      expect(id).toBe(3);
    });

    it('throws a descriptive error on an unexpected status', async () => {
      const service = new ImportRunnerService();
      await expect(
        service.upsertExternalSystem(
          () => Promise.resolve({ status: 500, body: { id: 0 } }),
          'BBL',
        ),
      ).rejects.toThrow(
        'Failed to upsert external system "BBL": unexpected status 500',
      );
    });
  });

  describe('recordUpsert', () => {
    it('returns true and records no error on a 200 response', () => {
      const service = new ImportRunnerService();
      const errors: ImportError[] = [];
      const result = service.recordUpsert(
        { status: 200, body: {} },
        { id: 1 },
        errors,
        () => 'unused',
      );
      expect(result).toBe(true);
      expect(errors).toHaveLength(0);
    });

    it('returns true and records no error on a 201 response', () => {
      const service = new ImportRunnerService();
      const errors: ImportError[] = [];
      const result = service.recordUpsert(
        { status: 201, body: {} },
        { id: 1 },
        errors,
        () => 'unused',
      );
      expect(result).toBe(true);
      expect(errors).toHaveLength(0);
    });

    it('returns false and records an error built from the response body on failure', () => {
      const service = new ImportRunnerService();
      const errors: ImportError[] = [];
      const item = { id: 2, name: 'Gruk' };
      const result = service.recordUpsert(
        { status: 409, body: { message: 'conflict' } },
        item,
        errors,
        (body) => `Failed: ${(body as { message: string }).message}`,
      );
      expect(result).toBe(false);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toEqual({ item, message: 'Failed: conflict' });
    });
  });
});
