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
  /** Per rules set of his era, whether lasting injuries never heal under it. */
  rulesSetsNeverHeal: readonly boolean[];
  /** When the earliest match recording his death was played; null when none is recorded. */
  diedAt: string | null;
}

/** LastingInjuryInput with its reduction times read. */
interface Timed {
  input: LastingInjuryInput;
  reducedAt: number[];
  earliest: number;
  /** The competition of the earliest reduction. */
  home: number;
}

/**
 * Decides whether a player's recorded stat reductions certainly still
 * apply. Under a rules set where they may heal they can do so between
 * competitions, and healing is optional, so a reduction is uncertain when
 * a point where it could heal comes after it. They are certain when:
 *
 * - every rules set of his era is stored as one under which they never
 *   heal (`rules_sets.lasting_injuries_never_heal`); an era with no rules
 *   set counts as possibly healing, and so does an uncurated rules set,
 *   which reads false;
 * - or all were suffered in one competition, and his team era played no
 *   match of another competition after the earliest of them. That also
 *   skips a player whose team played on after he left, which costs a fill
 *   but never proves a wrong one;
 * - or he died no earlier than every reduction, and no other competition
 *   of his team era both ran past the earliest reduction and started by
 *   his death: no point at which they heal passed while he was on the team.
 *
 * A time that cannot be read makes the proof that reads it fail.
 *
 * Pure decision logic, with no I/O and no dependencies.
 */
@Injectable()
export class LastingInjuryProofService {
  /** The reductions per characteristic, or undefined when one may have healed. */
  prove(input: LastingInjuryInput): ReductionCounts | undefined {
    const { reductions } = input;
    if (reductions.length === 0) {
      return undefined;
    }
    if (this.neverHeals(input.rulesSetsNeverHeal) || this.noHealPassed(input)) {
      return this.count(reductions);
    }
    return undefined;
  }

  private neverHeals(flags: readonly boolean[]): boolean {
    return flags.length > 0 && flags.every((flag) => flag);
  }

  private noHealPassed(input: LastingInjuryInput): boolean {
    const covered = new Set(input.competitions.map((row) => row.competitionId));
    if (input.reductions.some((row) => !covered.has(row.competitionId))) {
      return false;
    }
    const rows = input.reductions.map((row) => ({
      time: Date.parse(row.playedAt),
      competitionId: row.competitionId,
    }));
    if (rows.some((row) => Number.isNaN(row.time))) {
      return false;
    }
    const first = rows.reduce((best, row) =>
      row.time < best.time ? row : best,
    );
    const timed: Timed = {
      input,
      reducedAt: rows.map((row) => row.time),
      earliest: first.time,
      home: first.competitionId,
    };
    return this.withinOneCompetition(timed) || this.beforeDeath(timed);
  }

  /** All in one competition, and no other one played after the earliest. */
  private withinOneCompetition(timed: Timed): boolean {
    const { input, earliest } = timed;
    const ids = new Set(input.reductions.map((row) => row.competitionId));
    if (ids.size !== 1) {
      return false;
    }
    const playedTo = input.competitions
      .filter((row) => !ids.has(row.competitionId))
      .map((row) => Date.parse(row.lastPlayedAt));
    return playedTo.every((time) => !Number.isNaN(time) && time <= earliest);
  }

  /**
   * He died no earlier than every reduction, and no other competition both
   * started by his death and played on past the earliest reduction.
   */
  private beforeDeath(timed: Timed): boolean {
    const { input, reducedAt, earliest, home } = timed;
    if (input.diedAt === null) {
      return false;
    }
    const diedAt = Date.parse(input.diedAt);
    if (Number.isNaN(diedAt) || reducedAt.some((time) => time > diedAt)) {
      return false;
    }
    return input.competitions
      .filter((row) => row.competitionId !== home)
      .every((row) => {
        const first = Date.parse(row.firstPlayedAt);
        const last = Date.parse(row.lastPlayedAt);
        if (Number.isNaN(first) || Number.isNaN(last)) {
          return false;
        }
        return last <= earliest || first > diedAt;
      });
  }

  private count(reductions: readonly StatReductionEventRow[]): ReductionCounts {
    const counts: ReductionCounts = { ma: 0, st: 0, ag: 0, pa: 0, av: 0 };
    for (const row of reductions) {
      counts[row.characteristic] += 1;
    }
    return counts;
  }
}
