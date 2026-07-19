import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { SourceModule } from '../source/source.module';
import { EraDataConfigModule } from './era-data-config.module';
import { TpErasImportService } from './tp-eras-import.service';

@Module({
  imports: [ImportModule, EraDataConfigModule, SourceModule],
  providers: [TpErasImportService],
  exports: [TpErasImportService],
})
export class ErasModule {}
