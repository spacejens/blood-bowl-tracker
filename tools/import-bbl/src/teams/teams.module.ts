import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { CoachPageParser } from '../coaches/coach-page-parser';
import { RacePageParser } from '../races/race-page-parser';
import { SourceModule } from '../source/source.module';
import { BblTeamsImportService } from './bbl-teams-import.service';
import { TeamPageParser } from './team-page-parser';

@Module({
  imports: [ImportModule, SourceModule],
  providers: [
    TeamPageParser,
    RacePageParser,
    CoachPageParser,
    BblTeamsImportService,
  ],
  exports: [BblTeamsImportService],
})
export class TeamsModule {}
