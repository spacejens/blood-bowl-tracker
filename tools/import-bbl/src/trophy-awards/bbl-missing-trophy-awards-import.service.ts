import type { UpsertCompetition } from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ImportResultService,
  MissingTrophyAwardsImportService,
  ReferenceLookupService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

/**
 * The final step of a BBL import: for each imported competition, ask the
 * server to fill in the trophy awards BBL itself did not record, from the
 * statistics every earlier step just imported.
 *
 * This service holds no trophy logic whatsoever — which trophies apply, which
 * are already awarded, and how each winner is determined all live in
 * MissingTrophyAwardsService server-side, so the TP importer (and any future
 * one) calls exactly the same thing with nothing duplicated.
 *
 * `competitionOutcome.competitionEntriesByBblId` (BblCompetitionEntry) does
 * not itself carry a resolved database competition id — only the upsert
 * payload and the curated competition group id — so, exactly like
 * `BblMatchOutcomesImportService.importMatchOutcomes`, this service resolves
 * each competition's database id itself, in one batched round trip, before
 * computing its missing trophy awards.
 */
@Injectable()
export class BblMissingTrophyAwardsImportService {
  constructor(
    private readonly missingTrophyAwards: MissingTrophyAwardsImportService,
    private readonly importResults: ImportResultService,
    private readonly lookup: ReferenceLookupService,
  ) {}

  async importMissingTrophyAwards(
    competitionsByBblId: ReadonlyMap<string, UpsertCompetition>,
  ): Promise<{ result: ImportResult }> {
    let imported = 0;
    const errors: ImportError[] = [];

    // One round trip for the whole run: every competition referenced here was
    // upserted moments ago by the competitions step, so it is already in the
    // database and resolvable by its BBL id.
    const competitionIds = await this.lookup.lookupMap(
      'competition',
      [...competitionsByBblId].map(([bblId, competition]) => ({
        externalSystemId: competition.externalIds[0].externalSystemId,
        externalId: bblId,
      })),
    );

    for (const [bblId, competition] of competitionsByBblId) {
      const competitionId = competitionIds.get(
        this.lookup.keyOf({
          externalSystemId: competition.externalIds[0].externalSystemId,
          externalId: bblId,
        }),
      );
      if (competitionId === undefined) {
        errors.push(
          this.importResults.error({
            item: { competition: bblId },
            message: `Skipping missing trophy awards for competition id ${bblId}: it was not imported.`,
          }),
        );
        continue;
      }
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
