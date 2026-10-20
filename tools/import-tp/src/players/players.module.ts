import { ImportModule } from '@blood-bowl-tracker/import';
import { ParseTpModule } from '@blood-bowl-tracker/parse-tp';
import { Module } from '@nestjs/common';

import { EraDataConfigModule } from '../eras/era-data-config.module';
import { EraRulesSetModule } from '../eras/era-rules-set.module';
import { SourceModule } from '../source/source.module';
import { TpInducedStarPlayersImportService } from './tp-induced-star-players-import.service';
import { TpInducedStarPlayersStepService } from './tp-induced-star-players-step.service';
import { TpLastingInjuryBackfillImportService } from './tp-lasting-injury-backfill-import.service';
import { TpMercenaryPositionRaceErasImportService } from './tp-mercenary-position-race-eras-import.service';
import { TpSppAdjustmentsImportService } from './tp-spp-adjustments-import.service';
import { TpStarPositionCharacteristicsBuilderService } from './tp-star-position-characteristics-builder.service';

@Module({
  imports: [
    ImportModule,
    ParseTpModule,
    SourceModule,
    EraDataConfigModule,
    EraRulesSetModule,
  ],
  providers: [
    TpSppAdjustmentsImportService,
    TpMercenaryPositionRaceErasImportService,
    TpLastingInjuryBackfillImportService,
    TpInducedStarPlayersImportService,
    TpInducedStarPlayersStepService,
    TpStarPositionCharacteristicsBuilderService,
  ],
  exports: [
    TpSppAdjustmentsImportService,
    TpMercenaryPositionRaceErasImportService,
    TpLastingInjuryBackfillImportService,
    TpInducedStarPlayersStepService,
  ],
})
export class PlayersModule {}
