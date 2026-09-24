import {
  CompetitionsModule,
  ErasModule,
  ExternalSystemsModule,
} from '@blood-bowl-tracker/game-data';
import { Module } from '@nestjs/common';

import { TpImportResultsService } from '../tp-import-results.service';
import { TpUpsertRunnerService } from '../tp-upsert-runner.service';
import { TpCompetitionSpanService } from './tp-competition-span.service';
import { TpCompetitionUpsertService } from './tp-competition-upsert.service';

/**
 * Imports one TP competition straight into the database through
 * packages/game-data. ImportTpLiveModule imports it for the live imports.
 * The importing app provides packages/db's `DB`.
 */
@Module({
  imports: [CompetitionsModule, ErasModule, ExternalSystemsModule],
  providers: [
    TpCompetitionUpsertService,
    TpCompetitionSpanService,
    TpImportResultsService,
    TpUpsertRunnerService,
  ],
  exports: [TpCompetitionUpsertService],
})
export class TpCompetitionModule {}
