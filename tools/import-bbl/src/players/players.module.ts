import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { EraConfigModule } from '../eras/era-config.module';
import { SourceModule } from '../source/source.module';
import { BblPlayersImportService } from './bbl-players-import.service';
import { PlayerPageParser } from './player-page-parser';

@Module({
  imports: [ImportModule, SourceModule, EraConfigModule],
  providers: [PlayerPageParser, BblPlayersImportService],
  exports: [PlayerPageParser, BblPlayersImportService],
})
export class PlayersModule {}
