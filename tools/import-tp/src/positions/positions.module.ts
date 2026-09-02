import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { EraDataConfigModule } from '../eras/era-data-config.module';
import { EraRulesSetModule } from '../eras/era-rules-set.module';
import { SourceModule } from '../source/source.module';
import { TpPositionCharacteristicsImportService } from './tp-position-characteristics-import.service';
import { TpPositionRaceErasImportService } from './tp-position-race-eras-import.service';
import { TpPositionsImportService } from './tp-positions-import.service';

@Module({
  imports: [ImportModule, SourceModule, EraDataConfigModule, EraRulesSetModule],
  providers: [
    TpPositionsImportService,
    TpPositionRaceErasImportService,
    TpPositionCharacteristicsImportService,
  ],
  exports: [
    TpPositionsImportService,
    TpPositionRaceErasImportService,
    TpPositionCharacteristicsImportService,
  ],
})
export class PositionsModule {}
