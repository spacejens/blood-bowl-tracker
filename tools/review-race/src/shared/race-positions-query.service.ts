import type { Db } from '@blood-bowl-tracker/db';
import {
  and,
  asc,
  DB,
  eq,
  eraRulesSets,
  eras,
  positions,
  positionsRaceEras,
  raceEras,
  rulesSets,
} from '@blood-bowl-tracker/db';
import type { CharacteristicFormat } from '@blood-bowl-tracker/review-harness';
import { Inject, Injectable } from '@nestjs/common';

/** One era the race exists in. */
export interface RaceEraRow {
  eraId: number;
  eraName: string;
  startDate: string;
  endDate: string | null;
}

/** One (position, era) availability row for the race. Never a star player. */
export interface RacePositionRow {
  positionId: number;
  positionName: string;
  eraId: number;
  eraName: string;
}

/** One rules set the race's eras map to, with its display formats. */
export interface RaceRulesSetRow {
  rulesSetId: number;
  rulesSetName: string;
  moveFormat: CharacteristicFormat;
  strengthFormat: CharacteristicFormat;
  agilityFormat: CharacteristicFormat;
  passingFormat: CharacteristicFormat;
  armourFormat: CharacteristicFormat;
}

/**
 * The three race-scoped projections every data-type module needs: the race's
 * eras, the positions available in each of them, and the rules sets those
 * eras map to. Shared here rather than repeated per module so all three
 * panels agree on what "this race's positions" means.
 */
@Injectable()
export class RacePositionsQueryService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async erasFor(raceId: number): Promise<RaceEraRow[]> {
    return await this.db
      .select({
        eraId: eras.id,
        eraName: eras.name,
        startDate: eras.startDate,
        endDate: eras.endDate,
      })
      .from(raceEras)
      .innerJoin(eras, eq(eras.id, raceEras.eraId))
      .where(eq(raceEras.raceId, raceId))
      .orderBy(asc(eras.startDate), asc(eras.name));
  }

  /** Star players are excluded — this tool reviews ordinary positions only. */
  async positionsFor(raceId: number): Promise<RacePositionRow[]> {
    return await this.db
      .select({
        positionId: positions.id,
        positionName: positions.name,
        eraId: eras.id,
        eraName: eras.name,
      })
      .from(raceEras)
      .innerJoin(eras, eq(eras.id, raceEras.eraId))
      .innerJoin(
        positionsRaceEras,
        eq(positionsRaceEras.raceEraId, raceEras.id),
      )
      .innerJoin(positions, eq(positions.id, positionsRaceEras.positionId))
      .where(
        and(eq(raceEras.raceId, raceId), eq(positions.isStarPlayer, false)),
      )
      .orderBy(asc(eras.startDate), asc(positions.name));
  }

  async rulesSetsFor(raceId: number): Promise<RaceRulesSetRow[]> {
    return await this.db
      .selectDistinct({
        rulesSetId: rulesSets.id,
        rulesSetName: rulesSets.name,
        moveFormat: rulesSets.moveFormat,
        strengthFormat: rulesSets.strengthFormat,
        agilityFormat: rulesSets.agilityFormat,
        passingFormat: rulesSets.passingFormat,
        armourFormat: rulesSets.armourFormat,
      })
      .from(raceEras)
      .innerJoin(eraRulesSets, eq(eraRulesSets.eraId, raceEras.eraId))
      .innerJoin(rulesSets, eq(rulesSets.id, eraRulesSets.rulesSetId))
      .where(eq(raceEras.raceId, raceId))
      .orderBy(asc(rulesSets.name));
  }

  /**
   * `rulesSetId` -> the era(s) of this race that map to it. A race can span
   * several eras, each mapping to its own rules set(s), so a renderer needs
   * this to tell which of the race's positions are reachable under a given
   * rules set at all.
   */
  async rulesSetEraIds(raceId: number): Promise<Map<number, Set<number>>> {
    const rows = await this.db
      .select({ eraId: raceEras.eraId, rulesSetId: eraRulesSets.rulesSetId })
      .from(raceEras)
      .innerJoin(eraRulesSets, eq(eraRulesSets.eraId, raceEras.eraId))
      .where(eq(raceEras.raceId, raceId));
    const byRulesSet = new Map<number, Set<number>>();
    for (const row of rows) {
      const set = byRulesSet.get(row.rulesSetId) ?? new Set<number>();
      set.add(row.eraId);
      byRulesSet.set(row.rulesSetId, set);
    }
    return byRulesSet;
  }

  /**
   * `positionId` -> the era(s) it belongs to, folded from the (position, era)
   * rows `positionsFor` returns. Pure — the caller has already paid for the
   * query.
   */
  positionEraIds(positions: RacePositionRow[]): Map<number, Set<number>> {
    const byPosition = new Map<number, Set<number>>();
    for (const position of positions) {
      const set = byPosition.get(position.positionId) ?? new Set<number>();
      set.add(position.eraId);
      byPosition.set(position.positionId, set);
    }
    return byPosition;
  }
}
