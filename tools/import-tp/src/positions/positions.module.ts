import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { SourceModule } from '../source/source.module';
import { TpPositionRaceErasImportService } from './tp-position-race-eras-import.service';
import { TpPositionsImportService } from './tp-positions-import.service';

@Module({
  imports: [ImportModule, SourceModule],
  providers: [TpPositionsImportService, TpPositionRaceErasImportService],
  exports: [TpPositionsImportService, TpPositionRaceErasImportService],
})
export class PositionsModule {}
