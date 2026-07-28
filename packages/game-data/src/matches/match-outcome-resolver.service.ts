import type { MatchCategory } from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

export interface OutcomeMatchTeam {
  matchTeamId: number;
  teamEraId: number;
  score: number;
}

export interface OutcomeMatch {
  matchId: number;
  category: MatchCategory;
  teams: OutcomeMatchTeam[];
}

export interface ResolveOutcomesInput {
  matches: OutcomeMatch[];
  overrides: Map<number, number | null>;
  tieBreaks: Map<number, number | null>;
}

export interface ResolvedOutcome {
  matchId: number;
  winningMatchTeamId: number | null;
}

export interface OutcomeResolution {
  resolved: ResolvedOutcome[];
  unresolvedMatchIds: number[];
}

/** The only category a tied match may be recorded as a draw for. */
const DRAWABLE_CATEGORIES: readonly MatchCategory[] = ['normal'];

/**
 * Which later stage a tied match's winner can be traced to. A semifinal's
 * loser also plays the bronze match, so only the FINAL identifies a semifinal
 * winner; a qualifier's loser plays no later stage, so the semifinals
 * identify a qualifier winner.
 */
const NEXT_STAGE_CATEGORIES: Partial<
  Record<MatchCategory, readonly MatchCategory[]>
> = {
  season_qualifier: ['season_semi_final'],
  season_semi_final: ['season_final'],
};

/**
 * Decides every match's winner from already-imported data plus source hints.
 * Pure: it takes rows in and gives verdicts back, so the whole decision table
 * is unit-testable without a database. `MatchOutcomesService` does the I/O.
 *
 * Order of signals per match:
 * 1. A configured override — always wins, whatever the score says.
 * 2. A strictly highest score.
 * 3. Tied and the category allows a draw (`normal` only) — a draw.
 * 4. Tied on a qualifier/semifinal — bracket progression: whichever tied
 *    participant also appears in the next stage's matches. Checked before the
 *    source hint, because a source that reports a drawn semifinal (TP does)
 *    still played the bracket out.
 * 5. Tied on any other draw-forbidding category — the source's tie-break
 *    hint (a team era, or `null` for "the source says it really was a draw").
 * 6. Otherwise unresolved: the caller reports it rather than guessing.
 *
 * A hint naming a team era that is not a participant is treated as
 * unresolved, not silently ignored — a wrong override is a config bug worth
 * surfacing.
 */
@Injectable()
export class MatchOutcomeResolverService {
  resolve(input: ResolveOutcomesInput): OutcomeResolution {
    const resolved: ResolvedOutcome[] = [];
    const unresolvedMatchIds: number[] = [];

    for (const match of input.matches) {
      const outcome = this.resolveOne(match, input);
      if (outcome === undefined) {
        unresolvedMatchIds.push(match.matchId);
      } else {
        resolved.push(outcome);
      }
    }

    return { resolved, unresolvedMatchIds };
  }

  private resolveOne(
    match: OutcomeMatch,
    input: ResolveOutcomesInput,
  ): ResolvedOutcome | undefined {
    if (input.overrides.has(match.matchId)) {
      return this.applyHint(match, input.overrides.get(match.matchId) ?? null);
    }

    if (match.teams.length < 2) {
      // Nothing to compare. A `normal` match with no participants is a draw
      // by the same rule as a scoreless tie; anything else is a data gap.
      return DRAWABLE_CATEGORIES.includes(match.category)
        ? { matchId: match.matchId, winningMatchTeamId: null }
        : undefined;
    }

    const best = Math.max(...match.teams.map((team) => team.score));
    const leaders = match.teams.filter((team) => team.score === best);
    if (leaders.length === 1) {
      return {
        matchId: match.matchId,
        winningMatchTeamId: leaders[0].matchTeamId,
      };
    }

    if (DRAWABLE_CATEGORIES.includes(match.category)) {
      return { matchId: match.matchId, winningMatchTeamId: null };
    }

    const advanced = this.traceBracketProgression(match, leaders, input);
    if (advanced !== undefined) {
      return { matchId: match.matchId, winningMatchTeamId: advanced };
    }

    if (input.tieBreaks.has(match.matchId)) {
      return this.applyHint(match, input.tieBreaks.get(match.matchId) ?? null);
    }

    return undefined;
  }

  /** `null` means draw; a team era must be one of the match's participants. */
  private applyHint(
    match: OutcomeMatch,
    winnerTeamEraId: number | null,
  ): ResolvedOutcome | undefined {
    if (winnerTeamEraId === null) {
      return { matchId: match.matchId, winningMatchTeamId: null };
    }
    const winner = match.teams.find(
      (team) => team.teamEraId === winnerTeamEraId,
    );
    return winner === undefined
      ? undefined
      : { matchId: match.matchId, winningMatchTeamId: winner.matchTeamId };
  }

  /**
   * The tied participant that also appears in one of the match's next-stage
   * matches. `undefined` when the category has no next stage, when neither
   * tied participant advanced, or when both did (which contradicts the
   * bracket model and must not be guessed at).
   */
  private traceBracketProgression(
    match: OutcomeMatch,
    leaders: OutcomeMatchTeam[],
    input: ResolveOutcomesInput,
  ): number | undefined {
    const nextCategories = NEXT_STAGE_CATEGORIES[match.category];
    if (nextCategories === undefined) {
      return undefined;
    }
    const advancedTeamEraIds = new Set(
      input.matches
        .filter(
          (other) =>
            other.matchId !== match.matchId &&
            nextCategories.includes(other.category),
        )
        .flatMap((other) => other.teams.map((team) => team.teamEraId)),
    );
    const advanced = leaders.filter((team) =>
      advancedTeamEraIds.has(team.teamEraId),
    );
    return advanced.length === 1 ? advanced[0].matchTeamId : undefined;
  }
}
