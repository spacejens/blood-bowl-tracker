import {
  CompetitionGroupsModule,
  CompetitionsModule,
  ErasModule,
  ExternalSystemsModule,
  TeamsModule,
  TrophiesModule,
  TrophyAwardsModule,
} from '@blood-bowl-tracker/game-data';
import { Module } from '@nestjs/common';

import { TpImportResultsService } from '../tp-import-results.service';
import { TpUpsertRunnerService } from '../tp-upsert-runner.service';
import { TpCompetitionImportService } from './tp-competition-import.service';
import { TpCompetitionParticipantsService } from './tp-competition-participants.service';
import { TpCompetitionSpanService } from './tp-competition-span.service';
import { TpCompetitionTrophyAwardsService } from './tp-competition-trophy-awards.service';
import { TpCompetitionUpsertService } from './tp-competition-upsert.service';

/**
 * Imports one TP competition, with its registered teams and trophy awards,
 * straight into the database through packages/game-data.
 * packages/api-server imports it to implement `tpCompetitions.import`;
 * ImportTpLiveModule imports it for the live imports. The importing app
 * provides packages/db's `DB`.
 */
@Module({
  imports: [
    CompetitionGroupsModule,
    CompetitionsModule,
    ErasModule,
    ExternalSystemsModule,
    TeamsModule,
    TrophiesModule,
    TrophyAwardsModule,
  ],
  providers: [
    TpCompetitionImportService,
    TpCompetitionUpsertService,
    TpCompetitionParticipantsService,
    TpCompetitionTrophyAwardsService,
    TpCompetitionSpanService,
    TpImportResultsService,
    TpUpsertRunnerService,
  ],
  exports: [TpCompetitionImportService, TpCompetitionUpsertService],
})
export class TpCompetitionModule {}
