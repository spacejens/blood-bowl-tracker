import { Module } from '@nestjs/common';

import { DataFileModule } from '../data-file/data-file.module';
import { ManualImportModule } from '../import/manual-import.module';
import { BatchCatalogService } from './batch-catalog.service';
import { BatchContentHashService } from './batch-content-hash.service';
import { BatchLedgerService } from './batch-ledger.service';
import { BatchRunnerService } from './batch-runner.service';

@Module({
  imports: [DataFileModule, ManualImportModule],
  providers: [
    BatchCatalogService,
    BatchContentHashService,
    BatchLedgerService,
    BatchRunnerService,
  ],
  exports: [BatchCatalogService, BatchRunnerService],
})
export class BatchesModule {}
