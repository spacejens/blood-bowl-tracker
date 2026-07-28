import type {
  MatchCategory,
  MatchOutcomeHint,
} from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ImportResultService,
  MatchOutcomesImportService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { BblCompetitionTrophyReaderService } from './bbl-competition-trophy-reader.service';
import { BblMatchListReaderService } from './bbl-match-list-reader.service';
import type { CompetitionTrophyPlacements } from './competition-trophy-page-parser';
import { MatchMergeService } from './match-merge.service';
import { MatchResultConfigService } from './match-result-config.service';

export interface ImportBblMatchOutcomesOptions {
  competitionIdsByBblId: Map<string, number>;
  matchIdsByBblId: Map<string, number>;
  categoriesByBblId: Map<string, MatchCategory>;
  teamEraIdsByCompetitionBblId: Map<string, Map<string, number>>;
}

/** Categories whose tie-break winner is the competition's 1st-place team. */
const FIRST_PLACE_CATEGORIES: readonly MatchCategory[] = [
  'cup_final',
  'season_final',
];

@Injectable()
export class BblMatchOutcomesImportService {
  constructor(
    private readonly matchListReader: BblMatchListReaderService,
    private readonly trophyReader: BblCompetitionTrophyReaderService,
    private readonly resultConfig: MatchResultConfigService,
    private readonly matchMerge: MatchMergeService,
    private readonly matchOutcomes: MatchOutcomesImportService,
    private readonly importResults: ImportResultService,
  ) {}

  /**
   * The last step of a BBL import: for each competition, ask the server to
   * count every match team's touchdowns and settle every match's winner.
   *
   * Two kinds of hint are sent. A configured `matches.resultOverrides` entry
   * becomes an override (it wins over any computed result). The competition's
   * "Team trophy" placements become tie-breaks for its terminal matches only
   * — 1st place for a final, 3rd place for a bronze match — since those are
   * the only matches where a placement identifies a specific match's winner.
   * Everything else (a decisive score, a drawn normal match, a tied
   * semifinal traced through the bracket) the server settles on its own.
   *
   * A match the server cannot settle is recorded as an error naming its BBL
   * id and pointing at the override list, so the run fails loudly instead of
   * silently recording a draw.
   */
  async importMatchOutcomes(
    options: ImportBblMatchOutcomesOptions,
  ): Promise<{ result: ImportResult }> {
    let imported = 0;
    const errors: ImportError[] = [];

    const matchesByCompetitionId =
      await this.matchListReader.getMatchesByCompetitionId(errors);
    const placementsByCompetitionId =
      await this.trophyReader.getPlacementsByCompetitionId(errors);
    const merges = await this.matchMerge.resolve(errors);
    const resultOverrides = this.resultConfig.getResultOverrides();

    for (const [competitionBblId, matches] of matchesByCompetitionId) {
      const competitionId = options.competitionIdsByBblId.get(competitionBblId);
      if (competitionId === undefined) {
        errors.push(
          this.importResults.error({
            item: { competition: competitionBblId },
            message: `Skipping match outcomes for competition id ${competitionBblId}: it was not imported.`,
          }),
        );
        continue;
      }

      const teamEraIdsByCode =
        options.teamEraIdsByCompetitionBblId.get(competitionBblId) ??
        new Map<string, number>();
      const placements = placementsByCompetitionId.get(competitionBblId) ?? {};

      const overrides: MatchOutcomeHint[] = [];
      const tieBreaks: MatchOutcomeHint[] = [];
      const bblIdsByMatchId = new Map<number, string>();
      const overriddenMatchIds = new Set<number>();

      for (const match of matches) {
        if (merges.isSecondary(match.bblId)) {
          continue;
        }
        const matchId = options.matchIdsByBblId.get(match.bblId);
        if (matchId === undefined) {
          continue;
        }
        bblIdsByMatchId.set(matchId, match.bblId);

        const partnerBblId = merges.partnerBblId(match.bblId);
        const overrideCode = this.lookupOverride(
          resultOverrides,
          match.bblId,
          partnerBblId,
        );
        if (overrideCode !== undefined) {
          const winnerTeamEraId =
            overrideCode === null ? null : teamEraIdsByCode.get(overrideCode);
          if (winnerTeamEraId === undefined) {
            errors.push(
              this.importResults.error({
                item: { match: match.bblId },
                message:
                  `Skipping the result override for match ${match.bblId}: ` +
                  `could not resolve team code "${overrideCode}" to a team ` +
                  'era in its competition.',
              }),
            );
          } else {
            overrides.push({ matchId, winnerTeamEraId });
            overriddenMatchIds.add(matchId);
            continue;
          }
        }

        const tieBreakCode = this.placementFor(
          options.categoriesByBblId.get(match.bblId),
          placements,
        );
        if (tieBreakCode !== undefined) {
          const tieBreakTeamEraId = teamEraIdsByCode.get(tieBreakCode);
          if (tieBreakTeamEraId === undefined) {
            errors.push(
              this.importResults.error({
                item: { match: match.bblId },
                message:
                  `Skipping the Team trophy tie-break for match ${match.bblId}: ` +
                  `could not resolve team code "${tieBreakCode}" to a team ` +
                  'era in its competition.',
              }),
            );
          } else {
            tieBreaks.push({ matchId, winnerTeamEraId: tieBreakTeamEraId });
          }
        }
      }

      const outcome = await this.matchOutcomes.resolveOutcomes(
        { competitionId, overrides, tieBreaks },
        errors,
      );
      if (outcome === undefined) {
        continue;
      }
      imported += outcome.resolvedMatchIds.length;
      for (const unresolvedId of outcome.unresolvedMatchIds) {
        const bblId = bblIdsByMatchId.get(unresolvedId) ?? String(unresolvedId);
        const guidance = overriddenMatchIds.has(unresolvedId)
          ? 'Its configured matches.resultOverrides entry names a team era ' +
            "that is not one of the match's participants — fix that entry."
          : 'Add a matches.resultOverrides entry for it.';
        errors.push(
          this.importResults.error({
            item: { match: bblId },
            message:
              `Could not determine the outcome of match ${bblId}: it ended ` +
              'level, its stage forbids a draw, and neither the ' +
              "competition's Team trophy placements nor the bracket settle " +
              `it. ${guidance}`,
          }),
        );
      }
    }

    return { result: this.importResults.result({ imported, errors }) };
  }

  /**
   * A configured override for the match, else one for its merge partner (a
   * developer may key only one member of a merged pair). `undefined` means no
   * override; `null` means the configured value was "draw".
   */
  private lookupOverride(
    resultOverrides: Map<string, string | null>,
    bblId: string,
    partnerBblId: string | undefined,
  ): string | null | undefined {
    if (resultOverrides.has(bblId)) {
      return resultOverrides.get(bblId) ?? null;
    }
    if (partnerBblId !== undefined && resultOverrides.has(partnerBblId)) {
      return resultOverrides.get(partnerBblId) ?? null;
    }
    return undefined;
  }

  /** The placement that identifies this category's winner, if any. */
  private placementFor(
    category: MatchCategory | undefined,
    placements: CompetitionTrophyPlacements,
  ): string | undefined {
    if (category === undefined) {
      return undefined;
    }
    if (FIRST_PLACE_CATEGORIES.includes(category)) {
      return placements.first;
    }
    return category === 'season_bronze' ? placements.third : undefined;
  }
}
