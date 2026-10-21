import {
  CompetitionsModule,
  ExternalSystemsModule,
  MatchesModule,
  MatchEventsModule,
  PlayersModule,
  TeamsModule,
} from '@blood-bowl-tracker/game-data';
import { ImportSharedModule } from '@blood-bowl-tracker/import-shared';
import { ParseTpModule } from '@blood-bowl-tracker/parse-tp';
import { Module } from '@nestjs/common';

import { TpAdminMatchEventBuilderService } from './events/tp-admin-match-event-builder.service';
import { TpMatchEventFieldsService } from './events/tp-match-event-fields.service';
import { TpMatchEventKindBuildersService } from './events/tp-match-event-kind-builders.service';
import { TpMatchEventsBuilderService } from './events/tp-match-events-builder.service';
import { TpMatchEventsCorrelationService } from './events/tp-match-events-correlation.service';
import { TpMatchEventsUpsertService } from './events/tp-match-events-upsert.service';
import { TpMatchCategoryService } from './tp-match-category.service';
import { TpMatchContextService } from './tp-match-context.service';
import { TpMatchImportService } from './tp-match-import.service';
import { TpMatchOutcomeService } from './tp-match-outcome.service';
import { TpMatchUpsertService } from './tp-match-upsert.service';

/**
 * Imports one TP match straight into the database through
 * packages/game-data. packages/api-server imports it to implement
 * `tpMatches.import`; ImportTpLiveModule imports it for the live import. The
 * importing app provides packages/db's `DB`.
 */
@Module({
  imports: [
    ParseTpModule,
    ImportSharedModule,
    CompetitionsModule,
    ExternalSystemsModule,
    MatchesModule,
    MatchEventsModule,
    PlayersModule,
    TeamsModule,
  ],
  providers: [
    TpMatchImportService,
    TpMatchContextService,
    TpMatchUpsertService,
    TpMatchCategoryService,
    TpMatchEventsUpsertService,
    TpMatchEventsBuilderService,
    TpMatchEventKindBuildersService,
    TpAdminMatchEventBuilderService,
    TpMatchEventFieldsService,
    TpMatchEventsCorrelationService,
    TpMatchOutcomeService,
  ],
  exports: [TpMatchImportService],
})
export class TpMatchModule {}
