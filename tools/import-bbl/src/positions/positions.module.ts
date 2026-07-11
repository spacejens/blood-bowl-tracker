import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { PlayersModule } from '../players/players.module';
import { SourceModule } from '../source/source.module';
import { BblPositionsImportService } from './bbl-positions-import.service';
import { PositionPageParser } from './position-page-parser';

@Module({
  imports: [ImportModule, SourceModule, PlayersModule],
  providers: [PositionPageParser, BblPositionsImportService],
  exports: [BblPositionsImportService],
})
export class PositionsModule {}
