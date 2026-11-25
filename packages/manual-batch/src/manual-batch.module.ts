import { Module } from '@nestjs/common';

import { ManualBatchLayoutService } from './manual-batch-layout.service';
import { ManualBatchNameService } from './manual-batch-name.service';

/** The manual-import batch layout, shared by the importer, the planner and the review tools. */
@Module({
  providers: [ManualBatchNameService, ManualBatchLayoutService],
  exports: [ManualBatchNameService, ManualBatchLayoutService],
})
export class ManualBatchModule {}
