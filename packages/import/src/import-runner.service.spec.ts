import type { UpsertRecordOptions } from '@blood-bowl-tracker/import-shared';
import { UpsertRecorderService } from '@blood-bowl-tracker/import-shared';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { ImportRunnerService } from './import-runner.service';
import type { ImportError } from './types';

describe('ImportRunnerService', () => {
  let service: ImportRunnerService;
  let recorder: MockProxy<UpsertRecorderService>;

  /** The options the service handed the mocked recorder on its first call. */
  function recordedOptions(): UpsertRecordOptions<unknown> {
    return recorder.record.mock.calls[0][0];
  }

  beforeEach(async () => {
    recorder = mock<UpsertRecorderService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ImportRunnerService,
        { provide: UpsertRecorderService, useValue: recorder },
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
    it('returns true when the recorder resolves the run', async () => {
      recorder.record.mockResolvedValue(true);
      const errors: ImportError[] = [];
      const item = { id: 1 };
      const buildErrorMessage = () => 'message';

      await expect(
        service.recordUpsert({
          upsert: () => Promise.resolve({ id: 1 }),
          item,
          errors,
          buildErrorMessage,
        }),
      ).resolves.toBe(true);
      expect(recordedOptions().item).toBe(item);
      expect(recordedOptions().errors).toBe(errors);
      expect(recordedOptions().buildErrorMessage).toBe(buildErrorMessage);
    });

    it('returns false when the recorder recorded a failure', async () => {
      recorder.record.mockResolvedValue(undefined);

      await expect(
        service.recordUpsert({
          upsert: () => Promise.reject(new Error('conflict')),
          item: { id: 2 },
          errors: [],
          buildErrorMessage: () => 'message',
        }),
      ).resolves.toBe(false);
    });

    it('hands the recorder a run that awaits the upsert and resolves true even when the upsert resolves undefined', async () => {
      recorder.record.mockResolvedValue(true);
      const upsert = vi.fn(() => Promise.resolve(undefined));

      await service.recordUpsert({
        upsert,
        item: {},
        errors: [],
        buildErrorMessage: () => 'message',
      });

      await expect(recordedOptions().run()).resolves.toBe(true);
      expect(upsert).toHaveBeenCalledTimes(1);
    });
  });

  describe('recordUpsertResult', () => {
    it('passes the upsert to the recorder as the run and returns its value', async () => {
      recorder.record.mockResolvedValue({ id: 5, name: 'BB2020' });
      const upsert = () => Promise.resolve({ id: 5, name: 'BB2020' });
      const errors: ImportError[] = [];
      const item = { name: 'BB2020' };
      const buildErrorMessage = () => 'message';

      await expect(
        service.recordUpsertResult({ upsert, item, errors, buildErrorMessage }),
      ).resolves.toEqual({ id: 5, name: 'BB2020' });
      expect(recorder.record).toHaveBeenCalledWith({
        run: upsert,
        item,
        errors,
        buildErrorMessage,
      });
    });

    it('returns undefined when the recorder recorded a failure', async () => {
      recorder.record.mockResolvedValue(undefined);

      await expect(
        service.recordUpsertResult({
          upsert: () => Promise.reject(new Error('conflict')),
          item: { name: 'BB2020' },
          errors: [],
          buildErrorMessage: () => 'message',
        }),
      ).resolves.toBeUndefined();
    });
  });
});
