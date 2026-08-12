import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { EraConfigModule } from '../eras/era-config.module';
import { UpsertFieldNarrowingService } from '../shared/upsert-field-narrowing.service';
import { SourceModule } from '../source/source.module';
import { BblPlayersImportService } from './bbl-players-import.service';
import { BblSppAdjustmentsImportService } from './bbl-spp-adjustments-import.service';
import { PlayerPageParser } from './player-page-parser';

@Module({
  imports: [ImportModule, SourceModule, EraConfigModule],
  providers: [
    PlayerPageParser,
    BblPlayersImportService,
    BblSppAdjustmentsImportService,
    UpsertFieldNarrowingService,
  ],
  exports: [
    PlayerPageParser,
    BblPlayersImportService,
    BblSppAdjustmentsImportService,
  ],
})
export class PlayersModule {}
