import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { SourceModule } from '../source/source.module';
import { TpPlayersImportService } from './tp-players-import.service';
import { TpSppAdjustmentsImportService } from './tp-spp-adjustments-import.service';

@Module({
  imports: [ImportModule, SourceModule],
  providers: [TpPlayersImportService, TpSppAdjustmentsImportService],
  exports: [TpPlayersImportService, TpSppAdjustmentsImportService],
})
export class PlayersModule {}
