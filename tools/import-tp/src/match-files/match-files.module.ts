import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { SourceModule } from '../source/source.module';
import { TpMatchFilesImportService } from './tp-match-files-import.service';

@Module({
  // SourceModule supplies TpSourceReader and ExternalSystemNameConfigService;
  // ImportModule supplies ImportRunnerService and ImportResultService.
  imports: [ImportModule, SourceModule],
  providers: [TpMatchFilesImportService],
  exports: [TpMatchFilesImportService],
})
export class MatchFilesModule {}
