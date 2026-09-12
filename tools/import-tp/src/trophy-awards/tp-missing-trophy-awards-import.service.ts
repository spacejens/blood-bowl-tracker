import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ImportResultService,
  MissingTrophyAwardsImportService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

/**
 * The final step of a TP import: for each imported competition, ask the
 * server to fill in the trophy awards TP itself did not record. TP records
 * no player trophies at all, so this step is what gives TP-sourced
 * competitions their player trophies.
 *
 * This service holds no trophy logic whatsoever — which trophies apply, which
 * are already awarded, and how each winner is determined all live in
 * MissingTrophyAwardsService server-side, so the BBL importer calls exactly
 * the same thing with nothing duplicated.
 */
@Injectable()
export class TpMissingTrophyAwardsImportService {
  constructor(
    private readonly missingTrophyAwards: MissingTrophyAwardsImportService,
    private readonly importResults: ImportResultService,
  ) {}

  async importMissingTrophyAwards(
    competitionIds: readonly number[],
  ): Promise<{ result: ImportResult }> {
    let imported = 0;
    const errors: ImportError[] = [];
    for (const competitionId of competitionIds) {
      const computed = await this.missingTrophyAwards.computeMissing(
        { competitionId },
        errors,
      );
      // `undefined` means the call itself failed and was already recorded as
      // an error; the remaining competitions are still worth computing.
      if (computed !== undefined) {
        imported += computed.createdAwardCount;
      }
    }
    return { result: this.importResults.result({ imported, errors }) };
  }
}
