import {
  ErasModule,
  ExternalSystemsModule,
  KeywordsModule,
  PositionRulesSetKeywordsModule,
  PositionRulesSetSkillsModule,
  PositionRulesSetsModule,
  PositionsModule,
  RacesModule,
  RulesSetsModule,
  SkillRulesSetsModule,
  SkillsModule,
} from '@blood-bowl-tracker/game-data';
import { Module } from '@nestjs/common';

import { TpImportResultsService } from '../tp-import-results.service';
import { TpNameExternalIdService } from '../tp-name-external-id.service';
import { TpUpsertRunnerService } from '../tp-upsert-runner.service';
import { TpOfficialCharacteristicsSyncService } from './tp-official-characteristics-sync.service';
import { TpOfficialKeywordCatalogService } from './tp-official-keyword-catalog.service';
import { TpOfficialKeywordsSyncService } from './tp-official-keywords-sync.service';
import { TpOfficialPositionsUpsertService } from './tp-official-positions-upsert.service';
import { TpOfficialRacesUpsertService } from './tp-official-races-upsert.service';
import { TpOfficialSkillRefsService } from './tp-official-skill-refs.service';
import { TpOfficialStartingSkillsService } from './tp-official-starting-skills.service';
import { TpOfficialTeamsContextService } from './tp-official-teams-context.service';
import { TpOfficialTeamsImportService } from './tp-official-teams-import.service';

/**
 * Imports one rules set's TP official team list -- races, positions and
 * stars, characteristics, keywords and starting skills -- straight into the
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
    PositionRulesSetSkillsModule,
    PositionRulesSetsModule,
    PositionsModule,
    RacesModule,
    RulesSetsModule,
    SkillRulesSetsModule,
    SkillsModule,
  ],
  providers: [
    TpOfficialTeamsImportService,
    TpOfficialTeamsContextService,
    TpOfficialRacesUpsertService,
    TpOfficialPositionsUpsertService,
    TpOfficialCharacteristicsSyncService,
    TpOfficialKeywordCatalogService,
    TpOfficialKeywordsSyncService,
    TpOfficialSkillRefsService,
    TpOfficialStartingSkillsService,
    TpNameExternalIdService,
    TpImportResultsService,
    TpUpsertRunnerService,
  ],
  exports: [TpOfficialTeamsImportService],
})
export class TpOfficialTeamsModule {}
