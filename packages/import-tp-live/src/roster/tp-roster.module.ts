import {
  CoachesModule,
  ErasModule,
  ExternalSystemsModule,
  PlayersModule,
  PositionRulesSetsModule,
  PositionsModule,
  RacesModule,
  RulesSetsModule,
  TeamsModule,
} from '@blood-bowl-tracker/game-data';
import { ParseTpModule } from '@blood-bowl-tracker/parse-tp';
import { Module } from '@nestjs/common';

import { TpImportResultsService } from '../tp-import-results.service';
import { TpNameExternalIdService } from '../tp-name-external-id.service';
import { TpUpsertRunnerService } from '../tp-upsert-runner.service';
import { TpCharacteristicIncreasesService } from './players/tp-characteristic-increases.service';
import { TpLastingInjuryBuilderService } from './players/tp-lasting-injury-builder.service';
import { TpMercenaryCharacteristicsService } from './players/tp-mercenary-characteristics.service';
import { TpPlayerCharacteristicsBuilderService } from './players/tp-player-characteristics-builder.service';
import { TpPlayerPositionService } from './players/tp-player-position.service';
import { TpRosterPlayersImportService } from './players/tp-roster-players-import.service';
import { TpTeamUpsertService } from './team/tp-team-upsert.service';
import { TpRosterContextService } from './tp-roster-context.service';
import { TpRosterImportService } from './tp-roster-import.service';

/**
 * Imports one TP roster straight into the database through
 * packages/game-data. packages/api-server imports it to implement
 * `tpRosters.import`; ImportTpLiveModule imports it for the live import. The
 * importing app provides packages/db's `DB`.
 */
@Module({
  imports: [
    ParseTpModule,
    CoachesModule,
    ErasModule,
    ExternalSystemsModule,
    PlayersModule,
    PositionRulesSetsModule,
    PositionsModule,
    RacesModule,
    RulesSetsModule,
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
    TpNameExternalIdService,
    TpImportResultsService,
    TpUpsertRunnerService,
  ],
  exports: [
    TpRosterImportService,
    TpImportResultsService,
    TpUpsertRunnerService,
  ],
})
export class TpRosterModule {}
