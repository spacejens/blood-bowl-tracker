import type {
  ImportError,
  MatchOutcomeHint,
} from '@blood-bowl-tracker/api-contract';
import { MatchOutcomesService } from '@blood-bowl-tracker/game-data';
import type { TpMatch } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import { TpImportResultsService } from '../tp-import-results.service';
import { TpUpsertRunnerService } from '../tp-upsert-runner.service';
import type { TpMatchContext } from './tp-match-context.service';

/** Options for {@link TpMatchOutcomeService.resolveOutcome}. */
export interface ResolveTpMatchOutcomeOptions {
  match: TpMatch;
  /** The match's database id. */
  matchId: number;
  context: TpMatchContext;
  errors: ImportError[];
}

@Injectable()
export class TpMatchOutcomeService {
  constructor(
    private readonly matchOutcomes: MatchOutcomesService,
    private readonly importResults: TpImportResultsService,
    private readonly runner: TpUpsertRunnerService,
  ) {}

  /**
   * Resolves the match's winner once its teams and events are imported.
   * Scores are counted from its touchdown events; TP records
   * `scoreResume.winner` independently of the score, so it is sent as this
   * match's tie-break — including `'draw'`, TP stating the match really was
   * level. The server only consults it when the scores are tied and the
   * category forbids a draw, and prefers bracket progression for a tied
   * qualifier or semifinal.
   *
   * Resolution runs over the whole competition, but only this match's
   * status is reported: a sibling the server cannot decide without its own
   * tie-break is left untouched, and a bracket-traced outcome settles once
   * the later-stage match is imported. Resolves true when this match's
   * outcome was resolved; an unresolved one records one error.
   */
  async resolveOutcome({
    match,
    matchId,
    context,
    errors,
  }: ResolveTpMatchOutcomeOptions): Promise<boolean> {
    const outcome = await this.runner.record({
      run: () =>
        this.matchOutcomes.resolveForCompetition({
          competitionId: context.competitionId,
          overrides: [],
          tieBreaks: this.tieBreaks(match, matchId, context),
        }),
      item: { match: match.id },
      errors,
      buildErrorMessage: (error) =>
        `Failed to resolve the outcome of match ${match.id}: ${this.runner.messageOf(error)}`,
    });
    if (outcome === undefined) {
      return false;
    }
    if (outcome.unresolvedMatchIds.includes(matchId)) {
      errors.push(
        this.importResults.error({
          item: { match: match.id },
          message:
            `Could not determine the outcome of match ${match.id}: its ` +
            'outcome could not be resolved automatically — neither its ' +
            "score, TP's own recorded winner, nor the bracket settle it.",
        }),
      );
      return false;
    }
    return outcome.resolvedMatchIds.includes(matchId);
  }

  private tieBreaks(
    match: TpMatch,
    matchId: number,
    context: TpMatchContext,
  ): MatchOutcomeHint[] {
    if (match.winner === undefined) {
      return [];
    }
    const winnerTeamEraId =
      match.winner === 'draw'
        ? null
        : match.winner === 'home'
          ? context.homeTeamEraId
          : context.awayTeamEraId;
    return [{ matchId, winnerTeamEraId }];
  }
}
