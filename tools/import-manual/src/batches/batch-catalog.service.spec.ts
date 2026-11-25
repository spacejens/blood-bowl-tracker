import {
  type ManualBatch,
  ManualBatchLayoutService,
} from '@blood-bowl-tracker/manual-batch';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { BatchCatalogService } from './batch-catalog.service';

describe('BatchCatalogService', () => {
  let catalog: BatchCatalogService;
  let layout: MockProxy<ManualBatchLayoutService>;

  beforeEach(async () => {
    layout = mock<ManualBatchLayoutService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        BatchCatalogService,
        { provide: ManualBatchLayoutService, useValue: layout },
      ],
    }).compile();
    catalog = moduleRef.get(BatchCatalogService);
  });

  it("lists the batches under the data directory's batches directory", async () => {
    const batches: ManualBatch[] = [
      {
        name: '001-initial-seed',
        number: 1,
        dir: '/data/batches/001-initial-seed',
      },
    ];
    layout.listBatches.mockResolvedValue(batches);

    expect(await catalog.discover('/data')).toBe(batches);
    expect(layout.listBatches).toHaveBeenCalledWith('/data/batches');
  });

  it('propagates a layout error', async () => {
    layout.listBatches.mockRejectedValue(new Error('bad layout'));

    await expect(catalog.discover('/data')).rejects.toThrow('bad layout');
  });
});
