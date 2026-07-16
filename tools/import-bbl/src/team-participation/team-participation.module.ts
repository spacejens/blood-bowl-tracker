import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { MatchesModule } from '../matches/matches.module';
import { SourceModule } from '../source/source.module';
import { BblCompetitionStandingsReaderService } from './bbl-competition-standings-reader.service';
import { BblTeamParticipationImportService } from './bbl-team-participation-import.service';
import { CompetitionStandingsPageParser } from './competition-standings-page-parser';

@Module({
  imports: [ImportModule, SourceModule, MatchesModule],
  providers: [
    BblTeamParticipationImportService,
    BblCompetitionStandingsReaderService,
    CompetitionStandingsPageParser,
  ],
  exports: [BblTeamParticipationImportService],
})
export class TeamParticipationModule {}
