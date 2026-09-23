import {
  ErasModule,
  ExternalSystemsModule,
  RacesModule,
} from '@blood-bowl-tracker/game-data';
import { ParseTpModule } from '@blood-bowl-tracker/parse-tp';
import { ScrapeTpModule } from '@blood-bowl-tracker/scrape-tp';
import { TpPathsModule } from '@blood-bowl-tracker/tp-paths';
import { Module } from '@nestjs/common';

import { TpEraResolutionService } from './live/tp-era-resolution.service';
import { TpLiveTeamImportService } from './live/tp-live-team-import.service';
import { TpRosterFetchService } from './live/tp-roster-fetch.service';
import { TpRosterModule } from './roster/tp-roster.module';

/**
 * Live TP team import: fetch one roster from TP's API, resolve its era, and
 * import it through TpRosterModule, in-process. The importing app provides
 * TP_CONNECTION_PROVIDER from a `@Global()` module and packages/db's `DB`.
 */
@Module({
  imports: [
    ParseTpModule,
    ScrapeTpModule,
    TpPathsModule,
    TpRosterModule,
    ErasModule,
    ExternalSystemsModule,
    RacesModule,
  ],
  providers: [
    TpRosterFetchService,
    TpEraResolutionService,
    TpLiveTeamImportService,
  ],
  exports: [TpLiveTeamImportService],
})
export class ImportTpLiveModule {}
