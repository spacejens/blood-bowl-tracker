import { join } from 'node:path';

import {
  MANUAL_BATCHES_DIR_NAME,
  ManualBatchLayoutService,
} from '@blood-bowl-tracker/manual-batch';
import { Injectable } from '@nestjs/common';

import type { ManualBatch } from './manual-batch';

@Injectable()
export class BatchCatalogService {
  constructor(private readonly layout: ManualBatchLayoutService) {}

  /**
   * Every batch directory under `<dataDir>/batches`, in number order. Files
   * beside the directories (e.g. `.DS_Store`) are ignored; a directory not
   * named `NNN-<slug>` or two batches sharing a number is an error.
   */
  discover(dataDir: string): Promise<ManualBatch[]> {
    return this.layout.listBatches(join(dataDir, MANUAL_BATCHES_DIR_NAME));
  }
}
