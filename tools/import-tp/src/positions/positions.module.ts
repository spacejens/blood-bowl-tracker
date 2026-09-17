import { ImportModule } from '@blood-bowl-tracker/import';
import { ParseTpModule } from '@blood-bowl-tracker/parse-tp';
import { Module } from '@nestjs/common';

import { EraDataConfigModule } from '../eras/era-data-config.module';
import { EraRulesSetModule } from '../eras/era-rules-set.module';
import { SourceModule } from '../source/source.module';
import { TpPositionCharacteristicsImportService } from './tp-position-characteristics-import.service';
import { TpPositionSkillsImportService } from './tp-position-skills-import.service';
import { TpPositionsImportService } from './tp-positions-import.service';

@Module({
  imports: [
    ImportModule,
    SourceModule,
    EraDataConfigModule,
    EraRulesSetModule,
    ParseTpModule,
  ],
  providers: [
    TpPositionsImportService,
    TpPositionCharacteristicsImportService,
    TpPositionSkillsImportService,
  ],
  exports: [
    TpPositionsImportService,
    TpPositionCharacteristicsImportService,
    TpPositionSkillsImportService,
  ],
})
export class PositionsModule {}
