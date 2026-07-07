import { Module } from '@nestjs/common';
import { ImportRunnerService } from './import-runner.service';
import { CoachesImportService } from './coaches-import.service';
import { ExternalSystemsImportService } from './external-systems-import.service';

@Module({
  providers: [
    ImportRunnerService,
    CoachesImportService,
    ExternalSystemsImportService,
  ],
  exports: [
    ImportRunnerService,
    CoachesImportService,
    ExternalSystemsImportService,
  ],
})
export class ImportModule {}
