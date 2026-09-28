import type { ImportError } from '@blood-bowl-tracker/api-contract';
import { Test } from '@nestjs/testing';
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TpOfficialBatchGroup } from './tp-official-batch-sync.service';
import { TpOfficialBatchSyncService } from './tp-official-batch-sync.service';

function group(entries: number[], label: string): TpOfficialBatchGroup<number> {
  return {
    entries,
    item: { label },
    buildErrorMessage: (error) =>
      `Failed ${label}: ${error instanceof Error ? error.message : String(error)}`,
  };
}

describe('TpOfficialBatchSyncService', () => {
  let service: TpOfficialBatchSyncService;
  let sync: Mock<(entries: number[]) => Promise<unknown>>;
  let errors: ImportError[];

  beforeEach(async () => {
    sync = vi.fn<(entries: number[]) => Promise<unknown>>();
    sync.mockResolvedValue({});
    errors = [];
    const moduleRef = await Test.createTestingModule({
      providers: [TpOfficialBatchSyncService],
    }).compile();
    service = moduleRef.get(TpOfficialBatchSyncService);
  });

  it('makes no call for no groups', async () => {
    const written = await service.syncGroups({ groups: [], sync, errors });

    expect(sync).not.toHaveBeenCalled();
    expect(written).toBe(0);
    expect(errors).toEqual([]);
  });

  it("writes every group's entries in one call", async () => {
    const written = await service.syncGroups({
      groups: [group([1, 2], 'a'), group([3], 'b')],
      sync,
      errors,
    });

    expect(sync).toHaveBeenCalledTimes(1);
    expect(sync).toHaveBeenCalledWith([1, 2, 3]);
    expect(written).toBe(3);
    expect(errors).toEqual([]);
  });

  it('falls back to one call per group when the batch fails', async () => {
    sync.mockRejectedValueOnce(new Error('batch rejected'));

    const written = await service.syncGroups({
      groups: [group([1, 2], 'a'), group([3], 'b')],
      sync,
      errors,
    });

    expect(sync).toHaveBeenCalledTimes(3);
    expect(sync).toHaveBeenNthCalledWith(1, [1, 2, 3]);
    expect(sync).toHaveBeenNthCalledWith(2, [1, 2]);
    expect(sync).toHaveBeenNthCalledWith(3, [3]);
    expect(written).toBe(3);
    expect(errors).toEqual([]);
  });

  it('records the failing group and still writes the others', async () => {
    sync
      .mockRejectedValueOnce(new Error('batch rejected'))
      .mockRejectedValueOnce(new Error('bad a'))
      .mockResolvedValueOnce({});

    const written = await service.syncGroups({
      groups: [group([1, 2], 'a'), group([3], 'b')],
      sync,
      errors,
    });

    expect(written).toBe(1);
    expect(errors).toEqual([
      { item: { label: 'a' }, message: 'Failed a: bad a' },
    ]);
  });

  it('writes a single group once, without retrying it on failure', async () => {
    sync.mockRejectedValueOnce(new Error('bad a'));

    const written = await service.syncGroups({
      groups: [group([1, 2], 'a')],
      sync,
      errors,
    });

    expect(sync).toHaveBeenCalledTimes(1);
    expect(sync).toHaveBeenCalledWith([1, 2]);
    expect(written).toBe(0);
    expect(errors).toEqual([
      { item: { label: 'a' }, message: 'Failed a: bad a' },
    ]);
  });
});
