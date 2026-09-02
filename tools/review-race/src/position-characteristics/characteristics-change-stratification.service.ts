import type { Db } from '@blood-bowl-tracker/db';
import {
  DB,
  eraRulesSets,
  positionRulesSets,
  positionsRaceEras,
  raceEras,
  races,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import type {
  RaceStratifier,
  StratumSampleRequest,
} from '../shared/race-stratifier';
import type { ReviewRace, ReviewStratum } from '../shared/review.types';

const CHANGED = 'characteristics-changed';
const MISSING = 'missing-characteristics';

/**
 * The two shapes a per-rules-set characteristics mistake takes. A position
 * whose values differ between two rules sets is either a genuine rules change
 * or a curation slip, and only a human reading the rulebook can tell which; a
 * position with no row for a rules set its race's era maps to is either a
 * position that genuinely did not exist then or a gap in the curation. Both
 * are expressed race-first ("this race has at least one such position"),
 * because races are the sampling unit.
 */
@Injectable()
export class CharacteristicsChangeStratificationService implements RaceStratifier {
  private readonly strata: readonly ReviewStratum[] = [
    {
      id: CHANGED,
      label:
        'Race has a position whose characteristics changed between rules sets',
      sources: ['bbl', 'tp', 'manual'],
    },
    {
      id: MISSING,
      label:
        'Race has a position missing characteristics for a rules set it should have',
      sources: ['bbl', 'tp', 'manual'],
    },
  ];

  constructor(@Inject(DB) private readonly db: Db) {}

  listStrata(): ReviewStratum[] {
    return [...this.strata];
  }

  async sampleStratum({
    stratumId,
    limit,
  }: StratumSampleRequest): Promise<ReviewRace[]> {
    if (stratumId === CHANGED) {
      return await this.changed(limit);
    }
    if (stratumId === MISSING) {
      return await this.missing(limit);
    }
    throw new Error(
      `Unknown race stratum "${stratumId}". Known strata: ${CHANGED}, ${MISSING}.`,
    );
  }

  /**
   * A self-join on `position_rules_sets`, ordered by rules-set id so each
   * pair is considered once. Passing is compared with `is distinct from`
   * because it is nullable — `<>` against NULL is NULL, which would silently
   * drop exactly the CRP-vs-BB2020 pairs this stratum is for.
   */
  private async changed(limit: number): Promise<ReviewRace[]> {
    const other = alias(positionRulesSets, 'other_position_rules_sets');
    return await this.db
      .select({ raceId: races.id, raceName: races.name })
      .from(races)
      .innerJoin(raceEras, eq(raceEras.raceId, races.id))
      .innerJoin(
        positionsRaceEras,
        eq(positionsRaceEras.raceEraId, raceEras.id),
      )
      .innerJoin(
        positionRulesSets,
        eq(positionRulesSets.positionId, positionsRaceEras.positionId),
      )
      .innerJoin(
        other,
        and(
          eq(other.positionId, positionRulesSets.positionId),
          lt(positionRulesSets.rulesSetId, other.rulesSetId),
        ),
      )
      .where(
        or(
          ne(positionRulesSets.move, other.move),
          ne(positionRulesSets.strength, other.strength),
          ne(positionRulesSets.agility, other.agility),
          ne(positionRulesSets.armour, other.armour),
          sql`${positionRulesSets.passing} is distinct from ${other.passing}`,
        ),
      )
      .groupBy(races.id, races.name)
      .orderBy(sql`random()`)
      .limit(limit);
  }

  /** A (position, rules set) pair the race's eras imply but nothing stored. */
  private async missing(limit: number): Promise<ReviewRace[]> {
    return await this.db
      .select({ raceId: races.id, raceName: races.name })
      .from(races)
      .innerJoin(raceEras, eq(raceEras.raceId, races.id))
      .innerJoin(
        positionsRaceEras,
        eq(positionsRaceEras.raceEraId, raceEras.id),
      )
      .innerJoin(eraRulesSets, eq(eraRulesSets.eraId, raceEras.eraId))
      .leftJoin(
        positionRulesSets,
        and(
          eq(positionRulesSets.positionId, positionsRaceEras.positionId),
          eq(positionRulesSets.rulesSetId, eraRulesSets.rulesSetId),
        ),
      )
      .where(isNull(positionRulesSets.id))
      .groupBy(races.id, races.name)
      .orderBy(sql`random()`)
      .limit(limit);
  }
}
