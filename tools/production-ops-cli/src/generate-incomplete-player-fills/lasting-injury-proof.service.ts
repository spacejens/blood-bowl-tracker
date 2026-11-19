import { Injectable } from '@nestjs/common';

import type {
  ReductionCounts,
  StatReductionEventRow,
  TeamCompetitionRow,
} from './fill-plan.types';

/** All rows belong to one player. */
export interface LastingInjuryInput {
  /** The player's stat-reduction match events. */
  reductions: readonly StatReductionEventRow[];
  /** Every competition his team era played in, with its first and last match. */
  competitions: readonly TeamCompetitionRow[];
  /** The names of his era's rules sets. */
  rulesSetNames: readonly string[];
  /** When the earliest match recording his death was played; null when none is recorded. */
  diedAt: string | null;
}

/**
 * Decides whether a player's recorded stat reductions certainly still apply.
 * Newer rules sets let lasting injuries heal between competitions, so they
 * are certain only when every one was suffered in one competition, and his
 * team era played no match of another competition after the earliest of
 * them: no point at which they heal can have passed. That also skips a
 * player whose team played on after he left, which costs a fill but never
 * proves a wrong one.
 *
 * Pure decision logic, with no I/O and no dependencies.
 */
@Injectable()
export class LastingInjuryProofService {
  /** The reductions per characteristic, or undefined when one may have healed. */
  prove(input: LastingInjuryInput): ReductionCounts | undefined {
    const { reductions, competitions } = input;
    if (reductions.length === 0) {
      return undefined;
    }
    const competitionIds = new Set(reductions.map((row) => row.competitionId));
    if (competitionIds.size !== 1) {
      return undefined;
    }
    const covered = new Set(competitions.map((row) => row.competitionId));
    if ([...competitionIds].some((id) => !covered.has(id))) {
      return undefined;
    }
    const reducedAt = reductions.map((row) => Date.parse(row.playedAt));
    const playedTo = competitions
      .filter((row) => !competitionIds.has(row.competitionId))
      .map((row) => Date.parse(row.lastPlayedAt));
    if ([...reducedAt, ...playedTo].some((time) => Number.isNaN(time))) {
      return undefined;
    }
    const earliest = Math.min(...reducedAt);
    if (playedTo.some((time) => time > earliest)) {
      return undefined;
    }
    const counts: ReductionCounts = { ma: 0, st: 0, ag: 0, pa: 0, av: 0 };
    for (const row of reductions) {
      counts[row.characteristic] += 1;
    }
    return counts;
  }
}
