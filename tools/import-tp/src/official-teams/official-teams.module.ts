import { ImportModule } from '@blood-bowl-tracker/import';
import { ParseTpModule } from '@blood-bowl-tracker/parse-tp';
import { Module } from '@nestjs/common';

import { SourceModule } from '../source/source.module';
import { TpOfficialStarNormalizerService } from './tp-official-star-normalizer.service';
import { TpOfficialTeamsFilesImportService } from './tp-official-teams-files-import.service';

@Module({
  imports: [ImportModule, ParseTpModule, SourceModule],
  providers: [
    TpOfficialStarNormalizerService,
    TpOfficialTeamsFilesImportService,
  ],
  exports: [TpOfficialTeamsFilesImportService],
})
export class OfficialTeamsModule {}
