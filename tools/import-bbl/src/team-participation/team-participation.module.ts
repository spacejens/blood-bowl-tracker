import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { EraConfigModule } from '../eras/era-config.module';
import { MatchesModule } from '../matches/matches.module';
import { SourceModule } from '../source/source.module';
import { BblTeamParticipationImportService } from './bbl-team-participation-import.service';

@Module({
  imports: [ImportModule, SourceModule, MatchesModule, EraConfigModule],
  providers: [BblTeamParticipationImportService],
  exports: [BblTeamParticipationImportService],
})
export class TeamParticipationModule {}
