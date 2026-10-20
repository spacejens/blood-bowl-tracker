import {
  CompetitionGroupsModule,
  CompetitionsModule,
  ErasModule,
  ExternalSystemsModule,
  TeamsModule,
  TrophiesModule,
  TrophyAwardsModule,
} from '@blood-bowl-tracker/game-data';
import { ImportSharedModule } from '@blood-bowl-tracker/import-shared';
import { Module } from '@nestjs/common';

import { TpCompetitionClassifierService } from './tp-competition-classifier.service';
import { TpCompetitionGroupMatcherService } from './tp-competition-group-matcher.service';
import { TpCompetitionGroupPrecedentService } from './tp-competition-group-precedent.service';
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
 * provides packages/db's `DB`. The participants and trophy-awards services
 * are exported too, for a live match import that created a competition to
 * link its registered teams and record its awards.
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
    ImportSharedModule,
  ],
  providers: [
    TpCompetitionImportService,
    TpCompetitionUpsertService,
    TpCompetitionParticipantsService,
    TpCompetitionTrophyAwardsService,
    TpCompetitionSpanService,
    TpCompetitionClassifierService,
    TpCompetitionGroupMatcherService,
    TpCompetitionGroupPrecedentService,
  ],
  exports: [
    TpCompetitionImportService,
    TpCompetitionUpsertService,
    TpCompetitionParticipantsService,
    TpCompetitionTrophyAwardsService,
  ],
})
export class TpCompetitionModule {}
