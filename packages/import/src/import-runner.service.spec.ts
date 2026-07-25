import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { ImportResultService } from './import-result.service';
import { ImportRunnerService } from './import-runner.service';
import type { ImportError } from './types';

describe('ImportRunnerService', () => {
  let service: ImportRunnerService;
  let importResults: MockProxy<ImportResultService>;

  beforeEach(async () => {
    importResults = mock<ImportResultService>();
    importResults.error.mockImplementation((args) => args);
    const moduleRef = await Test.createTestingModule({
      providers: [
        ImportRunnerService,
        { provide: ImportResultService, useValue: importResults },
      ],
    }).compile();
    service = moduleRef.get(ImportRunnerService);
  });

  describe('upsertExternalSystem', () => {
    it('returns the external system id on success', async () => {
      const id = await service.upsertExternalSystem(
        () => Promise.resolve({ id: 7 }),
        'BBL',
      );
      expect(id).toBe(7);
    });

    it('throws a descriptive error when the upsert call fails', async () => {
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
      await expect(
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- verifying non-Error rejection handling
        service.upsertExternalSystem(() => Promise.reject('boom'), 'BBL'),
      ).rejects.toThrow('Failed to upsert external system "BBL": boom');
    });
  });

  describe('recordUpsert', () => {
    it('returns true and records no error on success', async () => {
      const errors: ImportError[] = [];
      const result = await service.recordUpsert({
        upsert: () => Promise.resolve({ id: 1 }),
        item: { id: 1 },
        errors,
        buildErrorMessage: () => 'unused',
      });
      expect(result).toBe(true);
      expect(errors).toHaveLength(0);
    });

    it('returns false and records an error built from the thrown error on failure', async () => {
      const errors: ImportError[] = [];
      const item = { id: 2, name: 'Gruk' };
      const result = await service.recordUpsert({
        upsert: () => Promise.reject(new Error('conflict')),
        item,
        errors,
        buildErrorMessage: (err) =>
          `Failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      expect(result).toBe(false);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toEqual({ item, message: 'Failed: conflict' });
    });
  });

  describe('recordUpsertResult', () => {
    it('returns the resolved value and records no error on success', async () => {
      const errors: ImportError[] = [];
      const result = await service.recordUpsertResult({
        upsert: () => Promise.resolve({ id: 5, name: 'BB2020' }),
        item: { name: 'BB2020' },
        errors,
        buildErrorMessage: () => 'unused',
      });
      expect(result).toEqual({ id: 5, name: 'BB2020' });
      expect(errors).toHaveLength(0);
    });

    it('returns undefined and records an error built from the thrown error on failure', async () => {
      const errors: ImportError[] = [];
      const item = { name: 'BB2020' };
      const result = await service.recordUpsertResult({
        upsert: () => Promise.reject(new Error('conflict')),
        item,
        errors,
        buildErrorMessage: (err) =>
          `Failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      expect(result).toBeUndefined();
      expect(errors).toEqual([{ item, message: 'Failed: conflict' }]);
    });
  });
});
