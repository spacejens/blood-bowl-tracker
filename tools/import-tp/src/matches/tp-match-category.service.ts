import type { MatchCategory } from '@blood-bowl-tracker/api-contract';
import type { TpMatch } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

export interface ClassifyTpMatchOptions {
  match: TpMatch;
  /** The owning competition's type -- cups never get a season_* category. */
  competitionType: 'season' | 'cup';
  /**
   * Every match in the same TP competition as `match` (including `match`
   * itself). A single match's own `(phaseOrder, round)` tuple cannot tell a
   * final apart from a bronze match sharing the same tuple -- only bracket
   * tracing across the rest of the competition's matches can.
   */
  competitionMatches: TpMatch[];
}

/** One `(phaseOrder, round)` position, and the matches sharing it. */
interface Stage {
  phaseOrder: number;
  round: number;
  matches: TpMatch[];
}

/**
 * Classifies a TP match's category from its `(phaseOrder, round)` position
 * within its competition's bracket -- TP names no stage in text (`roundName`
 * is only ever DAY/MATCHDAY/ROUND).
 *
 * ## The mapping (derived from real fixture data, developer-confirmed)
 *
 * `phaseOrder === 1` is always the main phase (the regular season, or a
 * cup's pool play) -- `normal`, for both `season` and `cup` competitions.
 *
 * Everything else only occurs in `season` competitions in the local fixture
 * data (no cup competition has more than one phase there), so a `cup` match
 * with `phaseOrder !== 1` has no confirmed mapping and throws.
 *
 * For a `season` competition, gather every match with `phaseOrder !== 1`
 * ("non-main matches") and sort their distinct `(phaseOrder, round)` pairs
 * ascending -- this reconstructs the true playoff sequence, because
 * `phaseType`'s literal value (30 vs 110 in the fixtures) is NOT stable
 * across seasons: which numeric phase hosts which stage flips from season to
 * season (the `tloegbbl-sasong-28` fixture is the one local example), but
 * the `(phaseOrder, round)` pair's ascending *position* always matches
 * chronological (`playedDate`) order. Confirmed shapes:
 *
 * - **6 non-main matches** (3 stages of 2, e.g. `tloegbbl-major-season-25`):
 *   stage 1 = `season_qualifier`, stage 2 = `season_semi_final`, stage 3 is
 *   the terminal stage (final + bronze, split below).
 * - **4 non-main matches** (2 stages of 2, e.g. `tloegbbl-sasong-28` — that
 *   season skips qualifying): stage 1 = `season_semi_final`, stage 2 is the
 *   terminal stage.
 * - Any other non-main match count (not 0, 4, or 6), or a stage whose bucket
 *   doesn't have exactly 2 matches, is an unanticipated shape -- throws
 *   rather than guessing.
 *
 * The terminal stage's two matches share an identical `(phaseOrder, round)`
 * tuple -- TP exposes no per-match signal distinguishing a final from a
 * bronze match. They are told apart by tracing which two teams *won* the
 * immediately preceding (semifinal) stage's two matches, via each match's
 * `winner`/`homeTeamTpId`/`awayTeamTpId`: the terminal match pairing the two
 * semifinal winners is `season_final`; the one pairing the two semifinal
 * losers is `season_bronze`. When one semifinal match is itself a drawn tie
 * (`winner: 'draw'`, as in the `tloegbbl-sasong-29` fixture), its winner is
 * inferred transitively: whichever terminal match contains the *other*
 * semifinal's confirmed winner is the final (since exactly one terminal
 * match can), so the remaining terminal match is bronze regardless of the
 * drawn semifinal's own result. If *both* semifinal matches are drawn there
 * is no confirmed winner to anchor that inference on, and the split is
 * genuinely unresolvable -- throws (never observed in local data).
 */
@Injectable()
export class TpMatchCategoryService {
  classify(options: ClassifyTpMatchOptions): MatchCategory {
    const { match, competitionType, competitionMatches } = options;

    if (match.phaseOrder === 1) {
      return 'normal';
    }

    if (competitionType === 'cup') {
      throw new Error(
        `TP match ${match.id}: phase order ${match.phaseOrder} is not the ` +
          'main phase (order 1), but no cup competition in the confirmed ' +
          'mapping ever has more than one phase. Extend ' +
          'TpMatchCategoryService once real data confirms what this phase ' +
          'means for a cup.',
      );
    }

    const nonMain = competitionMatches.filter((m) => m.phaseOrder !== 1);
    const stages = this.buildStages(nonMain);

    if (nonMain.length !== 4 && nonMain.length !== 6) {
      throw new Error(
        `TP match ${match.id}: its competition has ${nonMain.length} ` +
          'non-main-phase matches, but the confirmed mapping only covers ' +
          '4 (semifinal + final/bronze) or 6 (qualifier + semifinal + ' +
          'final/bronze). This is an unanticipated bracket shape.',
      );
    }
    for (const stage of stages) {
      if (stage.matches.length !== 2) {
        throw new Error(
          `TP match ${match.id}: phase order ${stage.phaseOrder} round ` +
            `${stage.round} has ${stage.matches.length} matches, but the ` +
            'confirmed mapping expects exactly 2 per stage. This is an ' +
            'unanticipated bracket shape.',
        );
      }
    }

    const stageIndex = stages.findIndex((stage) =>
      stage.matches.some((m) => m.id === match.id),
    );
    const isSixMatchShape = nonMain.length === 6;
    const qualifierIndex = isSixMatchShape ? 0 : -1;
    const semifinalIndex = isSixMatchShape ? 1 : 0;
    const terminalIndex = isSixMatchShape ? 2 : 1;

    if (stageIndex === qualifierIndex) {
      return 'season_qualifier';
    }
    if (stageIndex === semifinalIndex) {
      return 'season_semi_final';
    }
    if (stageIndex === terminalIndex) {
      return this.classifyTerminal(
        match,
        stages[semifinalIndex].matches,
        stages[terminalIndex].matches,
      );
    }
    // Unreachable given the stage-count/bucket-size checks above, but keeps
    // the function total rather than implicitly returning undefined.
    throw new Error(
      `TP match ${match.id}: could not place it in a recognized bracket stage.`,
    );
  }

  /** Every distinct `(phaseOrder, round)` pair among `nonMain`, sorted ascending. */
  private buildStages(nonMain: TpMatch[]): Stage[] {
    const byKey = new Map<string, Stage>();
    for (const m of nonMain) {
      const key = `${m.phaseOrder}:${m.round}`;
      const stage = byKey.get(key);
      if (stage) {
        stage.matches.push(m);
      } else {
        byKey.set(key, {
          phaseOrder: m.phaseOrder,
          round: m.round,
          matches: [m],
        });
      }
    }
    return [...byKey.values()].sort(
      (a, b) => a.phaseOrder - b.phaseOrder || a.round - b.round,
    );
  }

  /**
   * Splits the terminal stage's two matches into `season_final`/
   * `season_bronze` by tracing which teams won the semifinal stage's two
   * matches. See the class doc comment for the transitive-inference rule
   * covering a drawn semifinal.
   */
  private classifyTerminal(
    match: TpMatch,
    semifinalMatches: TpMatch[],
    terminalMatches: TpMatch[],
  ): MatchCategory {
    const winnerTeamId = (m: TpMatch): number | undefined =>
      m.winner === 'home'
        ? m.homeTeamTpId
        : m.winner === 'away'
          ? m.awayTeamTpId
          : undefined;

    const confirmedWinners = semifinalMatches
      .map(winnerTeamId)
      .filter((id): id is number => id !== undefined);

    if (confirmedWinners.length === 0) {
      throw new Error(
        `TP match ${match.id}: both semifinal-stage matches feeding it are ` +
          'drawn ties, so there is no confirmed winner to trace the ' +
          'final/bronze split from. This split is unresolvable with the ' +
          'data available.',
      );
    }

    const containsAnyWinner = (m: TpMatch): boolean =>
      confirmedWinners.includes(m.homeTeamTpId) ||
      confirmedWinners.includes(m.awayTeamTpId);

    const finalCandidates = terminalMatches.filter(containsAnyWinner);
    if (finalCandidates.length !== 1) {
      throw new Error(
        `TP match ${match.id}: expected exactly one terminal-stage match ` +
          `to contain a confirmed semifinal winner, found ` +
          `${finalCandidates.length}. This contradicts the confirmed ` +
          'bracket model.',
      );
    }

    const isFinal = finalCandidates[0].id === match.id;
    return isFinal ? 'season_final' : 'season_bronze';
  }
}
