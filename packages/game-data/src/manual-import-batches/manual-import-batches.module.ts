import { Module } from '@nestjs/common';

import { ManualImportBatchesService } from './manual-import-batches.service';

@Module({
  providers: [ManualImportBatchesService],
  exports: [ManualImportBatchesService],
})
export class ManualImportBatchesModule {}
