import { Module } from '@nestjs/common';

import { TpMatchPathsService } from './tp-match-paths.service';
import { TpOfficialTeamsPathsService } from './tp-official-teams-paths.service';
import { TpRosterPathsService } from './tp-roster-paths.service';
import { TpTournamentPathsService } from './tp-tournament-paths.service';

/**
 * TP's URL paths, as TP's own frontend requests them. Pure path building with
 * no I/O, so both a client-only tool (tools/download-tp) and the server-side
 * live import (packages/import-tp-live) can depend on it.
 */
@Module({
  providers: [
    TpMatchPathsService,
    TpOfficialTeamsPathsService,
    TpRosterPathsService,
    TpTournamentPathsService,
  ],
  exports: [
    TpMatchPathsService,
    TpOfficialTeamsPathsService,
    TpRosterPathsService,
    TpTournamentPathsService,
  ],
})
export class TpPathsModule {}
