import type { ImportError } from '@blood-bowl-tracker/api-contract';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { UpsertRecorderService } from './upsert-recorder.service';

describe('UpsertRecorderService', () => {
  let recorder: UpsertRecorderService;
  let errors: ImportError[];

  beforeEach(async () => {
    errors = [];
    const moduleRef = await Test.createTestingModule({
      providers: [UpsertRecorderService],
    }).compile();
    recorder = moduleRef.get(UpsertRecorderService);
  });

  it("resolves to the call's own value and records nothing on success", async () => {
    await expect(
      recorder.record({
        run: () => Promise.resolve(42),
        item: { team: 1 },
        errors,
        buildErrorMessage: () => 'unused',
      }),
    ).resolves.toBe(42);
    expect(errors).toEqual([]);
  });

  it('records one error naming the item and resolves to undefined on a throw', async () => {
    await expect(
      recorder.record({
        run: () => Promise.reject(new Error('boom')),
        item: { team: 1 },
        errors,
        buildErrorMessage: (error) => `Failed: ${recorder.messageOf(error)}`,
      }),
    ).resolves.toBeUndefined();
    expect(errors).toEqual([{ item: { team: 1 }, message: 'Failed: boom' }]);
  });

  it("reads an Error's message and stringifies anything else", () => {
    expect(recorder.messageOf(new Error('boom'))).toBe('boom');
    expect(recorder.messageOf('down')).toBe('down');
  });
});
