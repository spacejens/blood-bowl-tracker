import type {
  ImportError,
  ImportResult,
} from '@blood-bowl-tracker/api-contract';
import { MissingTrophyAwardsService } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';

import { TpImportResultsService } from '../tp-import-results.service';
import { TpUpsertRunnerService } from '../tp-upsert-runner.service';

/** Options for {@link TpExtraTrophyAwardsService.computeExtras}. */
export interface ComputeExtraTrophyAwardsOptions {
  competitionId: number;
  /**
   * The competition's tournament, as named in TP's frontend URLs; used in
   * error reports.
   */
  tournamentSlug: string;
}

/**
 * Awards a finished TP competition the trophies TP does not record itself
 * (max_count, max_spp_sum and career_threshold rules), through the same
 * MissingTrophyAwardsService the bulk importers reach over RPC. Holds no
 * trophy logic of its own. Idempotent: an already-recorded award is not
 * created again, so a later import retries a failed run safely. A failure
 * is reported in the result, never thrown.
 */
@Injectable()
export class TpExtraTrophyAwardsService {
  constructor(
    private readonly missingTrophyAwards: MissingTrophyAwardsService,
    private readonly importResults: TpImportResultsService,
    private readonly runner: TpUpsertRunnerService,
  ) {}

  async computeExtras({
    competitionId,
    tournamentSlug,
  }: ComputeExtraTrophyAwardsOptions): Promise<ImportResult> {
    const errors: ImportError[] = [];
    const computed = await this.runner.record({
      run: () => this.missingTrophyAwards.computeMissingAwards(competitionId),
      item: { tournamentSlug, competitionId },
      errors,
      buildErrorMessage: (error) =>
        `Could not compute the extra trophy awards of competition ${tournamentSlug}: ${this.runner.messageOf(error)}`,
    });
    return this.importResults.result({
      imported: computed?.createdAwardCount ?? 0,
      errors,
    });
  }

  /**
   * The result of not awarding a competition's extras because the match
   * backfill run in the same import reported errors: some matches may be
   * missing, and an award computed from incomplete matches is never
   * corrected later. Imports nothing and carries one error saying so.
   */
  skippedForBackfillErrors(tournamentSlug: string): ImportResult {
    return this.importResults.result({
      imported: 0,
      errors: [
        this.importResults.error({
          item: { tournamentSlug },
          message: `Skipped awarding the extra trophies of competition ${tournamentSlug}: the match backfill reported errors, so some matches may be missing. Import the competition again once its matches import cleanly.`,
        }),
      ],
    });
  }
}
