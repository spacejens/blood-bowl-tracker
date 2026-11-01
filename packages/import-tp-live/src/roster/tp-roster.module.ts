import {
  CoachesModule,
  ErasModule,
  ExternalSystemsModule,
  KeywordsModule,
  PlayerSkillsModule,
  PlayersModule,
  PositionRulesSetsModule,
  PositionsModule,
  RacesModule,
  RulesSetsModule,
  SkillsModule,
  SppModule,
  TeamsModule,
} from '@blood-bowl-tracker/game-data';
import { ImportSharedModule } from '@blood-bowl-tracker/import-shared';
import { ParseTpModule } from '@blood-bowl-tracker/parse-tp';
import { Module } from '@nestjs/common';

import { TpKeywordTargetDecoderService } from '../official-teams/tp-keyword-target-decoder.service';
import { TpOfficialKeywordCatalogService } from '../official-teams/tp-official-keyword-catalog.service';
import { TpSkillIdLookupService } from '../tp-skill-id-lookup.service';
import { TpAdvancementOrderService } from './players/tp-advancement-order.service';
import { TpCharacteristicIncreasesService } from './players/tp-characteristic-increases.service';
import { TpLastingInjuryBuilderService } from './players/tp-lasting-injury-builder.service';
import { TpLiveAdvancementSyncService } from './players/tp-live-advancement-sync.service';
import { TpMercenaryCharacteristicsService } from './players/tp-mercenary-characteristics.service';
import { TpPlayerCharacteristicsBuilderService } from './players/tp-player-characteristics-builder.service';
import { TpPlayerPositionService } from './players/tp-player-position.service';
import { TpPlayerStatusService } from './players/tp-player-status.service';
import { TpRosterPlayerSkillsService } from './players/tp-roster-player-skills.service';
import { TpRosterPlayersImportService } from './players/tp-roster-players-import.service';
import { TpRosterSkillIdsService } from './players/tp-roster-skill-ids.service';
import { TpTeamUpsertService } from './team/tp-team-upsert.service';
import { TpRosterContextService } from './tp-roster-context.service';
import { TpRosterImportService } from './tp-roster-import.service';

/**
 * Imports one TP roster straight into the database through
 * packages/game-data. packages/api-server imports it to implement
 * `tpRosters.import`; ImportTpLiveModule imports it for the live import.
 * Both sync the roster players' skills and characteristic increases
 * (reading the curated keyword catalogue for Hatred/Animosity targets); the
 * live import also deduces the order of new advancements through SppModule. The importing app provides
 * packages/db's `DB`.
 */
@Module({
  imports: [
    ParseTpModule,
    ImportSharedModule,
    CoachesModule,
    ErasModule,
    ExternalSystemsModule,
    KeywordsModule,
    PlayerSkillsModule,
    PlayersModule,
    PositionRulesSetsModule,
    PositionsModule,
    RacesModule,
    RulesSetsModule,
    SkillsModule,
    SppModule,
    TeamsModule,
  ],
  providers: [
    TpRosterImportService,
    TpRosterContextService,
    TpTeamUpsertService,
    TpRosterPlayersImportService,
    TpPlayerPositionService,
    TpMercenaryCharacteristicsService,
    TpCharacteristicIncreasesService,
    TpPlayerCharacteristicsBuilderService,
    TpLastingInjuryBuilderService,
    TpPlayerStatusService,
    TpRosterPlayerSkillsService,
    TpAdvancementOrderService,
    TpLiveAdvancementSyncService,
    TpRosterSkillIdsService,
    TpSkillIdLookupService,
    TpOfficialKeywordCatalogService,
    TpKeywordTargetDecoderService,
  ],
  exports: [TpRosterImportService],
})
export class TpRosterModule {}
