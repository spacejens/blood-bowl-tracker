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
import { TpLiveOfficialTeamsImportService } from './live/tp-live-official-teams-import.service';
import { TpLiveTeamImportService } from './live/tp-live-team-import.service';
import { TpMatchFetchService } from './live/tp-match-fetch.service';
import { TpOfficialTeamsFetchService } from './live/tp-official-teams-fetch.service';
import { TpRosterFetchService } from './live/tp-roster-fetch.service';
import { TpMatchModule } from './match/tp-match.module';
import { TpOfficialTeamsModule } from './official-teams/tp-official-teams.module';
import { TpRosterModule } from './roster/tp-roster.module';

/**
 * Live TP import: fetch one roster, one completed match with its teams and
 * competition, one competition with its registered teams and trophy awards,
 * or TP's official team list for every rules set, from TP's API and import
 * it in-process through TpRosterModule, TpMatchModule, TpCompetitionModule
 * and TpOfficialTeamsModule. The importing app provides
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
    TpOfficialTeamsModule,
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
    TpOfficialTeamsFetchService,
    TpLiveOfficialTeamsImportService,
  ],
  exports: [
    TpLiveTeamImportService,
    TpLiveMatchImportService,
    TpLiveCompetitionImportService,
    TpLiveOfficialTeamsImportService,
  ],
})
export class ImportTpLiveModule {}
