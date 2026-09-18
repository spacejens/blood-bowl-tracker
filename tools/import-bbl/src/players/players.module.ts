import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { EraConfigModule } from '../eras/era-config.module';
import { CharacteristicNotationConversionService } from '../shared/characteristic-notation-conversion.service';
import { SkillEntryService } from '../shared/skill-entry.service';
import { UpsertFieldNarrowingService } from '../shared/upsert-field-narrowing.service';
import { SourceModule } from '../source/source.module';
import { BblLastingInjuryBackfillImportService } from './bbl-lasting-injury-backfill-import.service';
import { BblPlayerSkillsImportService } from './bbl-player-skills-import.service';
import { BblPlayersImportService } from './bbl-players-import.service';
import { BblSppAdjustmentsImportService } from './bbl-spp-adjustments-import.service';
import { PlayerPageParser } from './player-page-parser';
import { SustainedInjuriesParser } from './sustained-injuries.parser';

@Module({
  imports: [ImportModule, SourceModule, EraConfigModule],
  providers: [
    PlayerPageParser,
    SustainedInjuriesParser,
    SkillEntryService,
    BblPlayersImportService,
    BblPlayerSkillsImportService,
    BblSppAdjustmentsImportService,
    BblLastingInjuryBackfillImportService,
    UpsertFieldNarrowingService,
    CharacteristicNotationConversionService,
  ],
  exports: [
    PlayerPageParser,
    SustainedInjuriesParser,
    BblPlayersImportService,
    BblPlayerSkillsImportService,
    BblSppAdjustmentsImportService,
    BblLastingInjuryBackfillImportService,
  ],
})
export class PlayersModule {}
