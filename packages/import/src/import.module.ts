import { Module } from '@nestjs/common';

import { BatchBufferService } from './batch-buffer.service';
import { CoachesImportService } from './coaches-import.service';
import { CompetitionsImportService } from './competitions-import.service';
import { ErasImportService } from './eras-import.service';
import { ExternalSystemBootstrapService } from './external-system-bootstrap.service';
import { ExternalSystemsImportService } from './external-systems-import.service';
import { ImportResultService } from './import-result.service';
import { ImportRunnerService } from './import-runner.service';
import { LeaguesImportService } from './leagues-import.service';
import { MatchDateRangeService } from './match-date-range.service';
import { MatchEventsImportService } from './match-events-import.service';
import { MatchOutcomesImportService } from './match-outcomes-import.service';
import { MatchesImportService } from './matches-import.service';
import { NameExternalIdService } from './name-external-id.service';
import { PlayersImportService } from './players-import.service';
import { PositionsImportService } from './positions-import.service';
import { RacesImportService } from './races-import.service';
import { RulesSetsImportService } from './rules-sets-import.service';
import { SppAdjustmentsImportService } from './spp-adjustments-import.service';
import { SppAwardValuesImportService } from './spp-award-values-import.service';
import { TeamsImportService } from './teams-import.service';

@Module({
  providers: [
    ImportRunnerService,
    ImportResultService,
    BatchBufferService,
    CoachesImportService,
    CompetitionsImportService,
    LeaguesImportService,
    MatchEventsImportService,
    MatchOutcomesImportService,
    MatchesImportService,
    MatchDateRangeService,
    NameExternalIdService,
    PlayersImportService,
    PositionsImportService,
    RacesImportService,
    ExternalSystemsImportService,
    ExternalSystemBootstrapService,
    RulesSetsImportService,
    SppAdjustmentsImportService,
    SppAwardValuesImportService,
    ErasImportService,
    TeamsImportService,
  ],
  exports: [
    ImportRunnerService,
    ImportResultService,
    BatchBufferService,
    CoachesImportService,
    CompetitionsImportService,
    LeaguesImportService,
    MatchEventsImportService,
    MatchOutcomesImportService,
    MatchesImportService,
    MatchDateRangeService,
    NameExternalIdService,
    PlayersImportService,
    PositionsImportService,
    RacesImportService,
    ExternalSystemsImportService,
    ExternalSystemBootstrapService,
    RulesSetsImportService,
    SppAdjustmentsImportService,
    SppAwardValuesImportService,
    ErasImportService,
    TeamsImportService,
  ],
})
export class ImportModule {}
