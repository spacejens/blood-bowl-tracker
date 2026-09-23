import {
  ErasModule,
  ExternalSystemsModule,
  RacesModule,
} from '@blood-bowl-tracker/game-data';
import { ImportModule } from '@blood-bowl-tracker/import';
import { ParseTpModule } from '@blood-bowl-tracker/parse-tp';
import { ScrapeTpModule } from '@blood-bowl-tracker/scrape-tp';
import { TpPathsModule } from '@blood-bowl-tracker/tp-paths';
import { Module } from '@nestjs/common';

import { TpEraResolutionService } from './live/tp-era-resolution.service';
import { TpLiveTeamImportService } from './live/tp-live-team-import.service';
import { TpRosterFetchService } from './live/tp-roster-fetch.service';
import { TpRosterImportModule } from './roster-import/tp-roster-import.module';
import { TpImportResultsService } from './tp-import-results.service';
import { TpUpsertRunnerService } from './tp-upsert-runner.service';

/**
 * Live TP team import. The importing app provides TP_CONNECTION_PROVIDER,
 * TP_EXTERNAL_SYSTEM_NAME_PROVIDER and TP_ERA_RULES_SETS_PROVIDER from a
 * `@Global()` module, plus `@blood-bowl-tracker/api-client`'s ApiClientModule
 * and `@blood-bowl-tracker/db`'s DB (game-data's services inject it). A bulk
 * importer that only needs the team/player upserts imports
 * TpRosterImportModule instead, and needs no TP connection.
 */
@Module({
  imports: [
    ErasModule,
    ExternalSystemsModule,
    ImportModule,
    ParseTpModule,
    RacesModule,
    ScrapeTpModule,
    TpPathsModule,
    TpRosterImportModule,
  ],
  providers: [
    TpRosterFetchService,
    TpEraResolutionService,
    TpImportResultsService,
    TpUpsertRunnerService,
    TpLiveTeamImportService,
  ],
  exports: [TpLiveTeamImportService],
})
export class ImportTpLiveModule {}
