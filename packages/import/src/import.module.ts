import { Module } from '@nestjs/common';
import { ImportRunnerService } from './import-runner.service';
import { CoachesImportService } from './coaches-import.service';
import { LeaguesImportService } from './leagues-import.service';
import { RacesImportService } from './races-import.service';
import { ExternalSystemsImportService } from './external-systems-import.service';

@Module({
  providers: [
    ImportRunnerService,
    CoachesImportService,
    LeaguesImportService,
    RacesImportService,
    ExternalSystemsImportService,
  ],
  exports: [
    ImportRunnerService,
    CoachesImportService,
    LeaguesImportService,
    RacesImportService,
    ExternalSystemsImportService,
  ],
})
export class ImportModule {}
