import type { Db } from '@blood-bowl-tracker/db';
import {
  DB,
  eraRulesSets,
  eras,
  positions,
  positionsRaceEras,
  raceEras,
  rulesSets,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';

/** How one characteristic is displayed under a rules set. */
export type CharacteristicFormat = 'absent' | 'bare' | 'plus';

/** One era the race exists in. */
export interface RaceEraRow {
  eraId: number;
  eraName: string;
  startDate: string;
  endDate: string | null;
}

/** One (position, era) availability row for the race. */
export interface RacePositionRow {
  positionId: number;
  positionName: string;
  isStarPlayer: boolean;
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

  async positionsFor(raceId: number): Promise<RacePositionRow[]> {
    return await this.db
      .select({
        positionId: positions.id,
        positionName: positions.name,
        isStarPlayer: positions.isStarPlayer,
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
      .where(eq(raceEras.raceId, raceId))
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
}
