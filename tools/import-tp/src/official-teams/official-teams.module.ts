import { ImportModule } from '@blood-bowl-tracker/import';
import { ParseTpModule } from '@blood-bowl-tracker/parse-tp';
import { Module } from '@nestjs/common';

import { SourceModule } from '../source/source.module';
import { TpOfficialStarNormalizerService } from './tp-official-star-normalizer.service';
import { TpOfficialTeamsChunkMergeService } from './tp-official-teams-chunk-merge.service';
import { TpOfficialTeamsChunkerService } from './tp-official-teams-chunker.service';
import { TpOfficialTeamsFilesImportService } from './tp-official-teams-files-import.service';
import { TpOfficialTeamsTimingReportService } from './tp-official-teams-timing-report.service';

@Module({
  imports: [ImportModule, ParseTpModule, SourceModule],
  providers: [
    TpOfficialStarNormalizerService,
    TpOfficialTeamsChunkMergeService,
    TpOfficialTeamsChunkerService,
    TpOfficialTeamsFilesImportService,
    TpOfficialTeamsTimingReportService,
  ],
  exports: [
    TpOfficialTeamsFilesImportService,
    TpOfficialTeamsTimingReportService,
  ],
})
export class OfficialTeamsModule {}
