import type { MatchOutcomeHint } from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ImportResultService,
  MatchOutcomesImportService,
} from '@blood-bowl-tracker/import';
import type { TpMatch } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

interface TeamEra {
  id: number;
  eraId: number;
}

export interface ImportTpMatchOutcomesOptions {
  matchesByCompetitionId: Map<number, TpMatch[]>;
  matchIdsByTpId: Map<number, number>;
  eraIdByCompetitionId: Map<number, number>;
  teamErasByRosterId: Map<number, TeamEra[]>;
}

@Injectable()
export class TpMatchOutcomesImportService {
  constructor(
    private readonly matchOutcomes: MatchOutcomesImportService,
    private readonly importResults: ImportResultService,
  ) {}

  /**
   * The last step of a TP import: for each competition, ask the server to
   * count every match team's touchdowns and settle every match's winner.
   *
   * TP records `scoreResume.winner` independently of the score, so every
   * match with one is sent as a tie-break — including `'draw'`, which is the
   * source stating the match really was level. The server only consults a
   * tie-break when the touchdown counts are actually tied AND the category
   * forbids a draw, and it prefers bracket progression for a tied
   * qualifier/semifinal, so sending them unconditionally costs nothing and
   * spares this service from re-deriving categories.
   *
   * TP has no result-override config: `scoreResume.winner` resolves every
   * tie-broken case TP is expected to hit. If one ever surfaces, it shows up
   * here as an unresolved-match error rather than a silent draw.
   */
  async importMatchOutcomes(
    options: ImportTpMatchOutcomesOptions,
  ): Promise<{ result: ImportResult }> {
    let imported = 0;
    const errors: ImportError[] = [];

    for (const [competitionId, matches] of options.matchesByCompetitionId) {
      const eraId = options.eraIdByCompetitionId.get(competitionId);
      if (eraId === undefined) {
        errors.push(
          this.importResults.error({
            item: { competitionId },
            message: `Skipping match outcomes for competition id ${competitionId}: its era is unknown, so winners cannot be resolved to team eras.`,
          }),
        );
        continue;
      }

      const tieBreaks: MatchOutcomeHint[] = [];
      const tpIdsByMatchId = new Map<number, number>();

      for (const match of matches) {
        const matchId = options.matchIdsByTpId.get(match.id);
        if (matchId === undefined) {
          continue;
        }
        tpIdsByMatchId.set(matchId, match.id);

        if (match.winner === undefined) {
          continue;
        }
        if (match.winner === 'draw') {
          tieBreaks.push({ matchId, winnerTeamEraId: null });
          continue;
        }

        const rosterId =
          match.winner === 'home' ? match.homeTeamTpId : match.awayTeamTpId;
        const teamEraId = options.teamErasByRosterId
          .get(rosterId)
          ?.find((teamEra) => teamEra.eraId === eraId)?.id;
        if (teamEraId === undefined) {
          errors.push(
            this.importResults.error({
              item: { match: match.id, roster: rosterId },
              message: `Skipping the outcome hint for match ${match.id}: could not resolve its team era for roster ${rosterId}.`,
            }),
          );
          continue;
        }
        tieBreaks.push({ matchId, winnerTeamEraId: teamEraId });
      }

      const outcome = await this.matchOutcomes.resolveOutcomes(
        { competitionId, overrides: [], tieBreaks },
        errors,
      );
      if (outcome === undefined) {
        continue;
      }
      imported += outcome.resolvedMatchIds.length;
      for (const unresolvedId of outcome.unresolvedMatchIds) {
        const tpId = tpIdsByMatchId.get(unresolvedId) ?? unresolvedId;
        errors.push(
          this.importResults.error({
            item: { match: tpId },
            message:
              `Could not determine the outcome of match ${tpId}: its ` +
              'outcome could not be resolved automatically — neither its ' +
              "score, TP's own recorded winner, nor the bracket settle it.",
          }),
        );
      }
    }

    return { result: this.importResults.result({ imported, errors }) };
  }
}
