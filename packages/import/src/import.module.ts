import { Module } from '@nestjs/common';

import { CoachesImportService } from './coaches-import.service';
import { ErasImportService } from './eras-import.service';
import { ExternalSystemsImportService } from './external-systems-import.service';
import { ImportRunnerService } from './import-runner.service';
import { LeaguesImportService } from './leagues-import.service';
import { RacesImportService } from './races-import.service';
import { RulesSetsImportService } from './rules-sets-import.service';

@Module({
  providers: [
    ImportRunnerService,
    CoachesImportService,
    LeaguesImportService,
    RacesImportService,
    ExternalSystemsImportService,
    RulesSetsImportService,
    ErasImportService,
  ],
  exports: [
    ImportRunnerService,
    CoachesImportService,
    LeaguesImportService,
    RacesImportService,
    ExternalSystemsImportService,
    RulesSetsImportService,
    ErasImportService,
  ],
})
export class ImportModule {}
