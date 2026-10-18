import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Inject, Injectable } from '@nestjs/common';

import type { RecordedBatch } from './manual-batch';

/**
 * The database's ledger of applied batches, reached only through the API.
 * Failures propagate: without the ledger the runner cannot tell which batches
 * to apply, so an unreachable API is an unexpected failure, not an
 * ImportError.
 */
@Injectable()
export class BatchLedgerService {
  constructor(@Inject(API_CLIENT) private readonly client: ApiClient) {}

  async list(): Promise<RecordedBatch[]> {
    const batches = await this.client.manualImportBatches.list({});
    return batches.map(({ name, contentHash }) => ({ name, contentHash }));
  }

  async record(batch: RecordedBatch): Promise<void> {
    await this.client.manualImportBatches.record(batch);
  }
}
