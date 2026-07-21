import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { SourceModule } from '../source/source.module';
import { TpPlayersImportService } from './tp-players-import.service';

@Module({
  imports: [ImportModule, SourceModule],
  providers: [TpPlayersImportService],
  exports: [TpPlayersImportService],
})
export class PlayersModule {}
