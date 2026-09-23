import { ImportModule } from '@blood-bowl-tracker/import';
import { Module } from '@nestjs/common';

import { TpEraRulesSetResolverService } from './eras/tp-era-rules-set-resolver.service';
import { TpInducedStarPlayersImportService } from './players/tp-induced-star-players-import.service';
import { TpLastingInjuryBuilderService } from './players/tp-lasting-injury-builder.service';
import { TpMercenaryCharacteristicsService } from './players/tp-mercenary-characteristics.service';
import { TpPlayerCharacteristicsBuilderService } from './players/tp-player-characteristics-builder.service';
import { TpPlayersImportService } from './players/tp-players-import.service';
import { TpTeamsImportService } from './teams/tp-teams-import.service';
import { TpRosterEraErrorService } from './tp-roster-era-error.service';

/**
 * The team and player upserts, shared by tools/import-tp's bulk run and this
 * package's live import. The importing app provides
 * TP_EXTERNAL_SYSTEM_NAME_PROVIDER and TP_ERA_RULES_SETS_PROVIDER from a
 * `@Global()` module, and `@blood-bowl-tracker/api-client`'s API_CLIENT
 * (which ImportModule's services call through).
 */
@Module({
  imports: [ImportModule],
  providers: [
    TpTeamsImportService,
    TpPlayersImportService,
    TpInducedStarPlayersImportService,
    TpLastingInjuryBuilderService,
    TpMercenaryCharacteristicsService,
    TpPlayerCharacteristicsBuilderService,
    TpEraRulesSetResolverService,
    TpRosterEraErrorService,
  ],
  exports: [
    TpTeamsImportService,
    TpPlayersImportService,
    TpEraRulesSetResolverService,
  ],
})
export class TpRosterImportModule {}
