import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { EraConfigModule } from '../eras/era-config.module';
import { PlayersModule } from '../players/players.module';
import { SourceModule } from '../source/source.module';
import { BblPositionCharacteristicsImportService } from './bbl-position-characteristics-import.service';
import { BblPositionRaceErasImportService } from './bbl-position-race-eras-import.service';
import { BblPositionsImportService } from './bbl-positions-import.service';
import { PositionPageParser } from './position-page-parser';

@Module({
  imports: [ImportModule, SourceModule, PlayersModule, EraConfigModule],
  providers: [
    PositionPageParser,
    BblPositionsImportService,
    BblPositionRaceErasImportService,
    BblPositionCharacteristicsImportService,
  ],
  exports: [
    BblPositionsImportService,
    BblPositionRaceErasImportService,
    BblPositionCharacteristicsImportService,
  ],
})
export class PositionsModule {}
