import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy } from 'vitest-mock-extended';
import { mockDeep } from 'vitest-mock-extended';

import { BatchLedgerService } from './batch-ledger.service';

describe('BatchLedgerService', () => {
  let ledger: BatchLedgerService;
  let client: DeepMockProxy<ApiClient>;

  beforeEach(async () => {
    client = mockDeep<ApiClient>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        BatchLedgerService,
        { provide: API_CLIENT, useValue: client },
      ],
    }).compile();
    ledger = moduleRef.get(BatchLedgerService);
  });

  it('lists the recorded batches by name and hash', async () => {
    client.manualImportBatches.list.mockResolvedValue([
      {
        name: '001-before-initial-sources',
        contentHash: 'a'.repeat(64),
        appliedAt: new Date('2026-10-18T00:00:00Z'),
      },
    ]);

    expect(await ledger.list()).toEqual([
      { name: '001-before-initial-sources', contentHash: 'a'.repeat(64) },
    ]);
    expect(client.manualImportBatches.list).toHaveBeenCalledWith({});
  });

  it('records a batch through the API', async () => {
    client.manualImportBatches.record.mockResolvedValue({
      name: '002-after-initial-sources',
      contentHash: 'b'.repeat(64),
      appliedAt: new Date('2026-10-18T00:00:00Z'),
      created: true,
    });

    await ledger.record({
      name: '002-after-initial-sources',
      contentHash: 'b'.repeat(64),
    });

    expect(client.manualImportBatches.record).toHaveBeenCalledWith({
      name: '002-after-initial-sources',
      contentHash: 'b'.repeat(64),
    });
  });
});
