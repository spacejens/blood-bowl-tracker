import type { Db } from '@blood-bowl-tracker/db';
import {
  asc,
  DB,
  eq,
  externalSystems,
  positionExternalIds,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import { StarPlayerReviewConfigService } from '../config/review-star-player-config.service';

/** One external id row as the report shows it. */
export interface StarPlayerExternalIdRow {
  systemName: string;
  externalId: string;
}

/** A star's external ids, bucketed by the source that owns each id space. */
export interface StarPlayerExternalIdSet {
  /** BBL's `"<typId>-<raceBblId>"` ids, one per race its page lists. */
  bbl: string[];
  /** TP's own spelling(s) of the star's name. */
  tp: string[];
  /** The bookkeeping "Name" system's ids — BBL's and TP's spellings. */
  name: string[];
}

const NAME_SYSTEM = 'Name';

/**
 * Resolves a sampled star player to the ids each raw source addresses it by.
 * Every raw renderer needs this, and a star's ids never change during a run,
 * so the rows are fetched once per star and memoized.
 */
@Injectable()
export class StarPlayerExternalIdsService {
  private readonly cache = new Map<number, StarPlayerExternalIdRow[]>();

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly config: StarPlayerReviewConfigService,
  ) {}

  /** Every external id the star carries, with its system name. */
  async allForPosition(positionId: number): Promise<StarPlayerExternalIdRow[]> {
    const cached = this.cache.get(positionId);
    if (cached !== undefined) {
      return cached;
    }
    const rows = await this.db
      .select({
        systemName: externalSystems.name,
        externalId: positionExternalIds.externalId,
      })
      .from(positionExternalIds)
      .innerJoin(
        externalSystems,
        eq(externalSystems.id, positionExternalIds.externalSystemId),
      )
      .where(eq(positionExternalIds.positionId, positionId))
      .orderBy(asc(externalSystems.name), asc(positionExternalIds.externalId));
    this.cache.set(positionId, rows);
    return rows;
  }

  /** The same ids, bucketed by source. */
  async forPosition(positionId: number): Promise<StarPlayerExternalIdSet> {
    const rows = await this.allForPosition(positionId);
    return {
      bbl: this.idsOf(rows, this.config.getExternalSystemName('bbl')),
      tp: this.idsOf(rows, this.config.getExternalSystemName('tp')),
      name: this.idsOf(rows, NAME_SYSTEM),
    };
  }

  /**
   * The BBL typIDs this star's page(s) live at. `tools/import-bbl` registers
   * one BBL id per race the position page lists, each formatted
   * `"<typId>-<raceBblId>"`, so the typID is the part before the FIRST `-`
   * (neither half is guaranteed hyphen-free) and the same typID repeats once
   * per listed race. A star whose BBL page listed no races carries only a
   * `Name` id and yields an empty list here — which is exactly the "no BBL
   * page to show" case the raw renderer reports.
   */
  async bblTypIdsFor(positionId: number): Promise<string[]> {
    const { bbl } = await this.forPosition(positionId);
    const typIds: string[] = [];
    for (const externalId of bbl) {
      const separator = externalId.indexOf('-');
      if (separator <= 0) {
        continue;
      }
      const typId = externalId.slice(0, separator);
      if (!typIds.includes(typId)) {
        typIds.push(typId);
      }
    }
    return typIds;
  }

  private idsOf(rows: StarPlayerExternalIdRow[], systemName: string): string[] {
    return rows
      .filter((row) => row.systemName === systemName)
      .map((row) => row.externalId);
  }
}
