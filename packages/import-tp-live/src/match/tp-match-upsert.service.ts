import type {
  ImportError,
  MatchCategory,
  TpBracketMatch,
  UpsertMatch,
} from '@blood-bowl-tracker/api-contract';
import {
  CompetitionsService,
  MatchesService,
} from '@blood-bowl-tracker/game-data';
import type { TpMatch } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import { TpImportResultsService } from '../tp-import-results.service';
import { TpUpsertRunnerService } from '../tp-upsert-runner.service';
import { TpMatchCategoryService } from './tp-match-category.service';
import type { TpMatchContext } from './tp-match-context.service';

/** Options for {@link TpMatchUpsertService.upsertMatch}. */
export interface UpsertTpMatchOptions {
  match: TpMatch;
  /** Every match in the match's competition, the match itself included. */
  bracket: TpBracketMatch[];
  context: TpMatchContext;
  errors: ImportError[];
}

/** Options for {@link TpMatchUpsertService.syncParticipation}. */
export interface SyncTpMatchParticipationOptions {
  match: TpMatch;
  context: TpMatchContext;
  errors: ImportError[];
}

@Injectable()
export class TpMatchUpsertService {
  constructor(
    private readonly categoryClassifier: TpMatchCategoryService,
    private readonly matches: MatchesService,
    private readonly competitions: CompetitionsService,
    private readonly importResults: TpImportResultsService,
    private readonly runner: TpUpsertRunnerService,
  ) {}

  /**
   * Classifies the match's category from its place in its competition's
   * bracket, then upserts its row under the TP system, keyed by its TP match
   * id. Matches carry no Name external id: their names are not unique. A
   * match that cannot be classified, or whose upsert fails, records one
   * error and is not written. Resolves to the match's database id.
   */
  async upsertMatch({
    match,
    bracket,
    context,
    errors,
  }: UpsertTpMatchOptions): Promise<number | undefined> {
    if (!bracket.some((m) => m.id === match.id)) {
      errors.push(
        this.importResults.error({
          item: { match: match.id },
          message: `Skipping match ${match.id}: it is not part of the given bracket, so it does not belong to the imported competition.`,
        }),
      );
      return undefined;
    }
    let category: MatchCategory;
    try {
      category = this.categoryClassifier.classify({
        match,
        competitionType: context.competitionType,
        competitionMatches: bracket,
      });
    } catch (error) {
      errors.push(
        this.importResults.error({
          item: { match: match.id },
          message: `Skipping match ${match.id}: ${this.runner.messageOf(error)}`,
        }),
      );
      return undefined;
    }
    const upserted = await this.runner.record({
      run: () =>
        this.matches.upsert({
          competitionId: context.competitionId,
          playedAt: match.playedDate,
          name: match.name,
          category,
          externalIds: this.matchExternalIds(match, context),
          teamEraIds: [],
        }),
      item: { match: match.id },
      errors,
      buildErrorMessage: (error) =>
        `Failed to upsert match ${match.id}: ${this.runner.messageOf(error)}`,
    });
    return upserted?.match.id;
  }

  /**
   * Links both teams' eras to the match (`match_teams`) and to its
   * competition (`competition_teams`). Both syncs only ever add, so
   * re-importing a match is harmless. Resolves true only when both succeed;
   * a failure records one error, and the competition is skipped when the
   * match link failed.
   */
  async syncParticipation({
    match,
    context,
    errors,
  }: SyncTpMatchParticipationOptions): Promise<boolean> {
    const teamEraIds = [context.homeTeamEraId, context.awayTeamEraId];
    const matchTeams = await this.runner.record({
      run: () =>
        this.matches.upsert({
          externalIds: this.matchExternalIds(match, context),
          teamEraIds,
        }),
      item: { match: match.id, teamEraIds },
      errors,
      buildErrorMessage: (error) =>
        `Failed to link the teams of match ${match.id}: ${this.runner.messageOf(error)}`,
    });
    if (matchTeams === undefined) {
      return false;
    }
    const competitionTeams = await this.runner.record({
      run: () =>
        this.competitions.upsert({
          externalIds: [
            {
              externalSystemId: context.tpSystemId,
              externalId: String(context.competitionTpId),
            },
          ],
          teamEraIds,
        }),
      item: { competition: context.competitionTpId, teamEraIds },
      errors,
      buildErrorMessage: (error) =>
        `Failed to add the teams of match ${match.id} to competition ${context.competitionTpId}: ${this.runner.messageOf(error)}`,
    });
    return competitionTeams !== undefined;
  }

  private matchExternalIds(
    match: TpMatch,
    context: TpMatchContext,
  ): UpsertMatch['externalIds'] {
    return [
      { externalSystemId: context.tpSystemId, externalId: String(match.id) },
    ];
  }
}
