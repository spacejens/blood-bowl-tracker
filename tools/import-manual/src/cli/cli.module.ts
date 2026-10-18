import { Module } from '@nestjs/common';

import { BatchesModule } from '../batches/batches.module';
import { ManualImportModule } from '../import/manual-import.module';
import { ImportManualCliService } from './import-manual-cli.service';
import { DEFAULT_MANUAL_DATA_DIR, MANUAL_DATA_DIR } from './manual-data-dir';

@Module({
  imports: [BatchesModule, ManualImportModule],
  providers: [
    ImportManualCliService,
    { provide: MANUAL_DATA_DIR, useValue: DEFAULT_MANUAL_DATA_DIR },
  ],
  exports: [ImportManualCliService],
})
export class CliModule {}
