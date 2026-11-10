import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { TpLastingInjuryBackfillImportService } from './tp-lasting-injury-backfill-import.service';
import { TpSppAdjustmentsImportService } from './tp-spp-adjustments-import.service';

@Module({
  imports: [ImportModule],
  providers: [
    TpSppAdjustmentsImportService,
    TpLastingInjuryBackfillImportService,
  ],
  exports: [
    TpSppAdjustmentsImportService,
    TpLastingInjuryBackfillImportService,
  ],
})
export class PlayersModule {}
