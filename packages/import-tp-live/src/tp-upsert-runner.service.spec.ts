import type { ImportError } from '@blood-bowl-tracker/api-contract';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { TpUpsertRunnerService } from './tp-upsert-runner.service';

describe('TpUpsertRunnerService', () => {
  let runner: TpUpsertRunnerService;
  let errors: ImportError[];

  beforeEach(async () => {
    errors = [];
    const moduleRef = await Test.createTestingModule({
      providers: [TpUpsertRunnerService],
    }).compile();
    runner = moduleRef.get(TpUpsertRunnerService);
  });

  it("resolves to the call's own value and records nothing on success", async () => {
    await expect(
      runner.record({
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
      runner.record({
        run: () => Promise.reject(new Error('boom')),
        item: { team: 1 },
        errors,
        buildErrorMessage: (error) => `Failed: ${runner.messageOf(error)}`,
      }),
    ).resolves.toBeUndefined();
    expect(errors).toEqual([{ item: { team: 1 }, message: 'Failed: boom' }]);
  });

  it("reads an Error's message and stringifies anything else", () => {
    expect(runner.messageOf(new Error('boom'))).toBe('boom');
    expect(runner.messageOf('down')).toBe('down');
  });
});
