import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { SourceModule } from '../source/source.module';
import { TpPositionsImportService } from './tp-positions-import.service';

@Module({
  imports: [ImportModule, SourceModule],
  providers: [TpPositionsImportService],
  exports: [TpPositionsImportService],
})
export class PositionsModule {}
