import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { EraDataConfigModule } from '../eras/era-data-config.module';
import { EraRulesSetModule } from '../eras/era-rules-set.module';
import { SourceModule } from '../source/source.module';
import { MercenaryCharacteristicsConfigService } from './mercenary-characteristics-config.service';
import { TpPlayerCharacteristicsBuilderService } from './tp-player-characteristics-builder.service';
import { TpPlayersImportService } from './tp-players-import.service';
import { TpSppAdjustmentsImportService } from './tp-spp-adjustments-import.service';

@Module({
  imports: [ImportModule, SourceModule, EraDataConfigModule, EraRulesSetModule],
  providers: [
    TpPlayersImportService,
    TpSppAdjustmentsImportService,
    TpPlayerCharacteristicsBuilderService,
    MercenaryCharacteristicsConfigService,
  ],
  exports: [TpPlayersImportService, TpSppAdjustmentsImportService],
})
export class PlayersModule {}
