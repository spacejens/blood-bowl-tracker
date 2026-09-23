import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { EraDataConfigModule } from '../eras/era-data-config.module';
import { SkillsModule } from '../skills/skills.module';
import { SourceModule } from '../source/source.module';
import { TpLastingInjuryBackfillImportService } from './tp-lasting-injury-backfill-import.service';
import { TpMercenaryPositionRaceErasImportService } from './tp-mercenary-position-race-eras-import.service';
import { TpPlayerSkillsImportService } from './tp-player-skills-import.service';
import { TpSppAdjustmentsImportService } from './tp-spp-adjustments-import.service';

@Module({
  imports: [ImportModule, SourceModule, EraDataConfigModule, SkillsModule],
  providers: [
    TpSppAdjustmentsImportService,
    TpMercenaryPositionRaceErasImportService,
    TpLastingInjuryBackfillImportService,
    TpPlayerSkillsImportService,
  ],
  exports: [
    TpSppAdjustmentsImportService,
    TpMercenaryPositionRaceErasImportService,
    TpLastingInjuryBackfillImportService,
    TpPlayerSkillsImportService,
  ],
})
export class PlayersModule {}
