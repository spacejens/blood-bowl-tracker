import {
  ErasModule,
  ExternalSystemsModule,
  KeywordsModule,
  PositionRulesSetKeywordsModule,
  PositionRulesSetSkillCategoriesModule,
  PositionRulesSetSkillsModule,
  PositionRulesSetsModule,
  PositionsModule,
  RacesModule,
  RulesSetsModule,
  SkillRulesSetsModule,
  SkillsModule,
} from '@blood-bowl-tracker/game-data';
import { ImportSharedModule } from '@blood-bowl-tracker/import-shared';
import { Module } from '@nestjs/common';

import { TpSkillIdLookupService } from '../tp-skill-id-lookup.service';
import { TpKeywordTargetDecoderService } from './tp-keyword-target-decoder.service';
import { TpOfficialBatchSyncService } from './tp-official-batch-sync.service';
import { TpOfficialCharacteristicsSyncService } from './tp-official-characteristics-sync.service';
import { TpOfficialKeywordCatalogService } from './tp-official-keyword-catalog.service';
import { TpOfficialKeywordsSyncService } from './tp-official-keywords-sync.service';
import { TpOfficialPositionsUpsertService } from './tp-official-positions-upsert.service';
import { TpOfficialRacesUpsertService } from './tp-official-races-upsert.service';
import { TpOfficialSkillCategoriesSyncService } from './tp-official-skill-categories-sync.service';
import { TpOfficialSkillRefsService } from './tp-official-skill-refs.service';
import { TpOfficialStartingSkillsService } from './tp-official-starting-skills.service';
import { TpOfficialTeamsContextService } from './tp-official-teams-context.service';
import { TpOfficialTeamsImportService } from './tp-official-teams-import.service';

/**
 * Imports one rules set's TP official team list -- races, positions and
 * stars, characteristics, keywords, starting skills and skill categories -- straight into the
 * database through packages/game-data. packages/api-server imports it to
 * implement `tpOfficialTeams.import`; ImportTpLiveModule imports it for the
 * live import. The importing app provides packages/db's `DB`.
 */
@Module({
  imports: [
    ErasModule,
    ExternalSystemsModule,
    KeywordsModule,
    PositionRulesSetKeywordsModule,
    PositionRulesSetSkillCategoriesModule,
    PositionRulesSetSkillsModule,
    PositionRulesSetsModule,
    PositionsModule,
    RacesModule,
    RulesSetsModule,
    SkillRulesSetsModule,
    SkillsModule,
    ImportSharedModule,
  ],
  providers: [
    TpOfficialTeamsImportService,
    TpOfficialTeamsContextService,
    TpOfficialRacesUpsertService,
    TpOfficialPositionsUpsertService,
    TpOfficialBatchSyncService,
    TpOfficialCharacteristicsSyncService,
    TpOfficialKeywordCatalogService,
    TpKeywordTargetDecoderService,
    TpOfficialKeywordsSyncService,
    TpOfficialSkillRefsService,
    TpSkillIdLookupService,
    TpOfficialStartingSkillsService,
    TpOfficialSkillCategoriesSyncService,
  ],
  exports: [TpOfficialTeamsImportService],
})
export class TpOfficialTeamsModule {}
