import {
  ErasModule,
  ExternalSystemsModule,
  RacesModule,
} from '@blood-bowl-tracker/game-data';
import { ParseTpModule } from '@blood-bowl-tracker/parse-tp';
import { ScrapeTpModule } from '@blood-bowl-tracker/scrape-tp';
import { TpPathsModule } from '@blood-bowl-tracker/tp-paths';
import { Module } from '@nestjs/common';

import { TpCompetitionModule } from './competition/tp-competition.module';
import { TpAwardsFetchService } from './live/tp-awards-fetch.service';
import { TpBracketFetchService } from './live/tp-bracket-fetch.service';
import { TpEraResolutionService } from './live/tp-era-resolution.service';
import { TpInscriptionsFetchService } from './live/tp-inscriptions-fetch.service';
import { TpLiveCompetitionImportService } from './live/tp-live-competition-import.service';
import { TpLiveMatchImportService } from './live/tp-live-match-import.service';
import { TpLiveTeamImportService } from './live/tp-live-team-import.service';
import { TpMatchFetchService } from './live/tp-match-fetch.service';
import { TpRosterFetchService } from './live/tp-roster-fetch.service';
import { TpMatchModule } from './match/tp-match.module';
import { TpRosterModule } from './roster/tp-roster.module';

/**
 * Live TP import: fetch one roster, one completed match with its teams and
 * competition, or one competition with its registered teams and trophy
 * awards, from TP's API and import it in-process through TpRosterModule,
 * TpMatchModule and TpCompetitionModule. The importing app provides
 * TP_CONNECTION_PROVIDER from a `@Global()` module and packages/db's `DB`.
 */
@Module({
  imports: [
    ParseTpModule,
    ScrapeTpModule,
    TpPathsModule,
    TpRosterModule,
    TpMatchModule,
    ErasModule,
    ExternalSystemsModule,
    RacesModule,
    TpCompetitionModule,
  ],
  providers: [
    TpRosterFetchService,
    TpEraResolutionService,
    TpLiveTeamImportService,
    TpMatchFetchService,
    TpBracketFetchService,
    TpLiveMatchImportService,
    TpAwardsFetchService,
    TpInscriptionsFetchService,
    TpLiveCompetitionImportService,
  ],
  exports: [
    TpLiveTeamImportService,
    TpLiveMatchImportService,
    TpLiveCompetitionImportService,
  ],
})
export class ImportTpLiveModule {}
