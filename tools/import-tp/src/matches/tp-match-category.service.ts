import type {
  CompetitionType,
  MatchCategory,
} from '@blood-bowl-tracker/api-contract';
import type { TpMatch } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

export interface ClassifyTpMatchOptions {
  match: TpMatch;
  /** The owning competition's type -- cups never get a season_* category. */
  competitionType: CompetitionType;
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
 * within its competition's bracket — TP names no stage in text (`roundName` is
 * only ever DAY/MATCHDAY/ROUND).
 *
 * Stages are identified by the ascending *position* of the distinct
 * `(phaseOrder, round)` pairs, never by their literal values: which numeric
 * phase hosts which stage flips from season to season, and one observed season
 * even groups its qualifier and semifinal under a single `phaseOrder`. The
 * ascending position, unlike the numbers, always tracks `playedDate` order.
 *
 * The terminal stage's two matches share an identical `(phaseOrder, round)`
 * tuple — TP exposes no per-match signal separating a final from a bronze
 * match. They are told apart by which two teams won the preceding semifinal
 * stage. A drawn semifinal is resolved transitively: exactly one terminal
 * match can contain the other semifinal's confirmed winner, so that one is the
 * final. Two drawn semifinals leave nothing to anchor on and throw, as does
 * any bracket shape not seen in real data — guessing would silently mislabel a
 * final.
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
          'non-main-phase matches, but the confirmed mapping only covers a ' +
          'season with 4 (semifinal + final/bronze) or 6 (qualifier + ' +
          'semifinal + final/bronze) non-main-phase matches. This is an ' +
          'unanticipated bracket shape.',
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
    if (stageIndex === -1) {
      // Unreachable from TpMatchesImportService, which always includes
      // `match` in `competitionMatches` -- but guard explicitly rather than
      // let findIndex's "not found" sentinel (-1) collide with a stage
      // index below, which would otherwise silently misclassify instead of
      // throwing.
      throw new Error(
        `TP match ${match.id}: it was not found among its own ` +
          'competitionMatches, so its bracket stage cannot be determined.',
      );
    }
    const isSixMatchShape = nonMain.length === 6;
    // The 4-match shape has no qualifier stage at all -- `undefined`, not a
    // numeric sentinel, so it can never accidentally equal a real stageIndex.
    const qualifierIndex = isSixMatchShape ? 0 : undefined;
    const semifinalIndex = isSixMatchShape ? 1 : 0;
    const terminalIndex = isSixMatchShape ? 2 : 1;

    if (qualifierIndex !== undefined && stageIndex === qualifierIndex) {
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
