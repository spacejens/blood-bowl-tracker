import { Module } from '@nestjs/common';

import { CoachesImportService } from './coaches-import.service';
import { CompetitionsImportService } from './competitions-import.service';
import { ErasImportService } from './eras-import.service';
import { ExternalSystemsImportService } from './external-systems-import.service';
import { ImportRunnerService } from './import-runner.service';
import { LeaguesImportService } from './leagues-import.service';
import { MatchesImportService } from './matches-import.service';
import { PositionsImportService } from './positions-import.service';
import { RacesImportService } from './races-import.service';
import { RulesSetsImportService } from './rules-sets-import.service';
import { TeamsImportService } from './teams-import.service';

@Module({
  providers: [
    ImportRunnerService,
    CoachesImportService,
    CompetitionsImportService,
    LeaguesImportService,
    MatchesImportService,
    PositionsImportService,
    RacesImportService,
    ExternalSystemsImportService,
    RulesSetsImportService,
    ErasImportService,
    TeamsImportService,
  ],
  exports: [
    ImportRunnerService,
    CoachesImportService,
    CompetitionsImportService,
    LeaguesImportService,
    MatchesImportService,
    PositionsImportService,
    RacesImportService,
    ExternalSystemsImportService,
    RulesSetsImportService,
    ErasImportService,
    TeamsImportService,
  ],
})
export class ImportModule {}
