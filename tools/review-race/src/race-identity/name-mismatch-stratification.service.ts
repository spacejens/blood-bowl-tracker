import type { Db } from '@blood-bowl-tracker/db';
import { DB, races } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { RaceExternalIdsService } from '../shared/race-external-ids.service';
import { RaceNameComparisonService } from '../shared/race-name-comparison.service';
import type {
  RaceStratifier,
  StratumSampleRequest,
} from '../shared/race-stratifier';
import type { ReviewRace, ReviewStratum } from '../shared/review.types';
import { BblRawRaceIndexService } from '../source/bbl-raw-race-index.service';
import { TpRawRosterIndexService } from '../source/tp-raw-roster-index.service';

const NAME_MISMATCH = 'name-mismatch';

/**
 * Races whose BBL and TP names disagree by more than BBL's "<Race> Team(s)"
 * suffix convention. This is the case the curated `races-and-positions.json5`
 * pairing exists to handle, so a race landing here is either a pairing that
 * was missed or two genuinely different races merged by mistake.
 *
 * Inherently a two-source comparison, hence `sources: ['bbl', 'tp']`: the
 * curated data has no independent name of its own to disagree with — it
 * registers into the BBL/TP/Name id spaces.
 */
@Injectable()
export class NameMismatchStratificationService implements RaceStratifier {
  private readonly strata: readonly ReviewStratum[] = [
    {
      id: NAME_MISMATCH,
      label: 'BBL and TP names disagree',
      sources: ['bbl', 'tp'],
    },
  ];

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly externalIds: RaceExternalIdsService,
    private readonly bbl: BblRawRaceIndexService,
    private readonly tp: TpRawRosterIndexService,
    private readonly names: RaceNameComparisonService,
  ) {}

  listStrata(): ReviewStratum[] {
    return [...this.strata];
  }

  async sampleStratum({
    stratumId,
    limit,
  }: StratumSampleRequest): Promise<ReviewRace[]> {
    if (stratumId !== NAME_MISMATCH) {
      throw new Error(
        `Unknown race stratum "${stratumId}". Known strata: ${NAME_MISMATCH}.`,
      );
    }
    const rows = await this.db
      .select({ raceId: races.id, raceName: races.name })
      .from(races)
      .orderBy(sql`random()`);

    const selected: ReviewRace[] = [];
    for (const row of rows) {
      if (selected.length >= limit) {
        break;
      }
      if (await this.disagrees(row.raceId)) {
        selected.push(row);
      }
    }
    return selected;
  }

  private async disagrees(raceId: number): Promise<boolean> {
    const ids = await this.externalIds.forRace(raceId);
    const bblName = await this.firstName(ids.bbl, async (id) => {
      const race = await this.bbl.raceFor(id);
      return race?.listName ?? race?.teamPageName ?? null;
    });
    const tpName = await this.firstName(
      ids.tp,
      async (code) => (await this.tp.raceFor(code))?.rosterName ?? null,
    );
    if (bblName === null || tpName === null) {
      return false;
    }
    return !this.names.agree(bblName, tpName);
  }

  private async firstName(
    ids: string[],
    resolve: (id: string) => Promise<string | null>,
  ): Promise<string | null> {
    for (const id of ids) {
      const name = await resolve(id);
      if (name !== null) {
        return name;
      }
    }
    return null;
  }
}
