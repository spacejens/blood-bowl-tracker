import {
  ConfigErrorMessageService,
  ImportModule,
} from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { EraConfigModule } from '../eras/era-config.module';
import { SourceModule } from '../source/source.module';
import { BblCompetitionTrophyReaderService } from './bbl-competition-trophy-reader.service';
import { BblMatchDetailReaderService } from './bbl-match-detail-reader.service';
import { BblMatchListReaderService } from './bbl-match-list-reader.service';
import { BblMatchOutcomesImportService } from './bbl-match-outcomes-import.service';
import { BblMatchesImportService } from './bbl-matches-import.service';
import { CellAnnotationService } from './cell-annotation.service';
import { CompetitionTrophyPageParser } from './competition-trophy-page-parser';
import { MatchCategoryClassifierService } from './match-category-classifier.service';
import { MatchCategoryConfigService } from './match-category-config.service';
import { MatchEventsPageParser } from './match-events-page-parser';
import { MatchListPageParser } from './match-list-page-parser';
import { MatchMergeService } from './match-merge.service';
import { MatchMergeConfigService } from './match-merge-config.service';
import { MatchResultConfigService } from './match-result-config.service';
import { MatchTeamsPageParser } from './match-teams-page-parser';

@Module({
  imports: [SourceModule, ImportModule, EraConfigModule],
  providers: [
    MatchListPageParser,
    MatchTeamsPageParser,
    MatchEventsPageParser,
    CellAnnotationService,
    BblMatchDetailReaderService,
    BblMatchListReaderService,
    BblMatchesImportService,
    MatchCategoryClassifierService,
    MatchCategoryConfigService,
    MatchMergeConfigService,
    MatchMergeService,
    MatchResultConfigService,
    CompetitionTrophyPageParser,
    BblCompetitionTrophyReaderService,
    BblMatchOutcomesImportService,
    ConfigErrorMessageService,
  ],
  exports: [
    MatchListPageParser,
    MatchTeamsPageParser,
    MatchEventsPageParser,
    CellAnnotationService,
    BblMatchDetailReaderService,
    BblMatchListReaderService,
    BblMatchesImportService,
    MatchCategoryClassifierService,
    MatchCategoryConfigService,
    MatchMergeConfigService,
    MatchMergeService,
    MatchResultConfigService,
    CompetitionTrophyPageParser,
    BblCompetitionTrophyReaderService,
    BblMatchOutcomesImportService,
  ],
})
export class MatchesModule {}
