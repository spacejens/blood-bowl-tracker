import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { TpTeamParticipationImportService } from './tp-team-participation-import.service';

@Module({
  // ImportModule supplies CompetitionsImportService + MatchesImportService.
  // No SourceModule/ParseTpModule: this service does no file I/O or parsing and
  // reads the TP external-system id from each competition's own upsert object.
  imports: [ImportModule],
  providers: [TpTeamParticipationImportService],
  exports: [TpTeamParticipationImportService],
})
export class TeamParticipationModule {}
