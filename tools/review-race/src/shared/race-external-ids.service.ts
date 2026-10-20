import type { Db } from '@blood-bowl-tracker/db';
import {
  asc,
  DB,
  eq,
  externalSystems,
  raceExternalIds,
} from '@blood-bowl-tracker/db';
import {
  BBL_EXTERNAL_SYSTEM_NAME,
  TP_EXTERNAL_SYSTEM_NAME,
} from '@blood-bowl-tracker/review-harness';
import { Inject, Injectable } from '@nestjs/common';

/** One external id row as the report shows it. */
export interface RaceExternalIdRow {
  systemName: string;
  externalId: string;
}

/** A race's external ids, bucketed by the source that owns each id space. */
export interface RaceExternalIdSet {
  /** BBL's numeric race ids. */
  bbl: string[];
  /** TP's `teamRace` codes; a race legitimately has several. */
  tp: string[];
  /** The bookkeeping "Name" system's ids. */
  name: string[];
}

const NAME_SYSTEM = 'Name';

/**
 * Resolves a sampled race to the ids each raw source addresses it by. Every
 * raw renderer needs this, and a race's ids never change during a run, so the
 * rows are fetched once per race and memoized.
 */
@Injectable()
export class RaceExternalIdsService {
  private readonly cache = new Map<number, RaceExternalIdRow[]>();

  constructor(@Inject(DB) private readonly db: Db) {}

  /** Every external id the race carries, with its system name. */
  async allForRace(raceId: number): Promise<RaceExternalIdRow[]> {
    const cached = this.cache.get(raceId);
    if (cached !== undefined) {
      return cached;
    }
    const rows = await this.db
      .select({
        systemName: externalSystems.name,
        externalId: raceExternalIds.externalId,
      })
      .from(raceExternalIds)
      .innerJoin(
        externalSystems,
        eq(externalSystems.id, raceExternalIds.externalSystemId),
      )
      .where(eq(raceExternalIds.raceId, raceId))
      .orderBy(asc(externalSystems.name), asc(raceExternalIds.externalId));
    this.cache.set(raceId, rows);
    return rows;
  }

  /** The same ids, bucketed by source. */
  async forRace(raceId: number): Promise<RaceExternalIdSet> {
    const rows = await this.allForRace(raceId);
    return {
      bbl: this.idsOf(rows, BBL_EXTERNAL_SYSTEM_NAME),
      tp: this.idsOf(rows, TP_EXTERNAL_SYSTEM_NAME),
      name: this.idsOf(rows, NAME_SYSTEM),
    };
  }

  private idsOf(rows: RaceExternalIdRow[], systemName: string): string[] {
    return rows
      .filter((row) => row.systemName === systemName)
      .map((row) => row.externalId);
  }
}
