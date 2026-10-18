import { ManualImportBatchContentMismatchError } from '@blood-bowl-tracker/game-data';
import { call } from '@orpc/server';
import { beforeEach, describe, expect, it } from 'vitest';

import { createRouterHarness } from './rpc-router-factory.test-helpers';

const batch = {
  name: '001-initial-seed',
  contentHash: 'a'.repeat(64),
  appliedAt: new Date('2026-10-18T00:00:00Z'),
};
const input = { name: batch.name, contentHash: batch.contentHash };

describe('RpcRouterFactoryService manualImportBatches router', () => {
  let harness: Awaited<ReturnType<typeof createRouterHarness>>;

  beforeEach(async () => {
    harness = await createRouterHarness();
  });

  it('lists the recorded batches', async () => {
    harness.mocks.manualImportBatchesService.listAll.mockResolvedValue([batch]);

    await expect(
      call(harness.router.manualImportBatches.list, {}),
    ).resolves.toEqual([batch]);
  });

  it('records a batch and flattens its created flag', async () => {
    harness.mocks.manualImportBatchesService.record.mockResolvedValue({
      batch,
      created: true,
    });

    await expect(
      call(harness.router.manualImportBatches.record, input),
    ).resolves.toEqual({ ...batch, created: true });
    expect(
      harness.mocks.manualImportBatchesService.record,
    ).toHaveBeenCalledWith(input);
  });

  it('translates a content mismatch into CONFLICT', async () => {
    harness.mocks.manualImportBatchesService.record.mockRejectedValue(
      new ManualImportBatchContentMismatchError('edited'),
    );

    await expect(
      call(harness.router.manualImportBatches.record, input),
    ).rejects.toMatchObject({ code: 'CONFLICT', message: 'edited' });
  });

  it('lets any other failure propagate', async () => {
    harness.mocks.manualImportBatchesService.record.mockRejectedValue(
      new Error('database down'),
    );

    await expect(
      call(harness.router.manualImportBatches.record, input),
    ).rejects.toThrow('database down');
  });
});
