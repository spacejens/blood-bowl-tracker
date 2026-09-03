import {
  eraRulesSets,
  players,
  positionRulesSets,
  teamEras,
} from '@blood-bowl-tracker/db';
import { Injectable } from '@nestjs/common';
import type { SQL } from 'drizzle-orm';
import { and, eq, gt, isNotNull, lt, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { ExternalSystemLookupService } from '../shared/external-system-lookup.service';
import { PlayerProjectionQueryService } from '../shared/player-projection-query.service';
import type {
  PlayerStratifier,
  StratumSampleRequest,
} from '../shared/player-stratifier';
import type { ReviewPlayer, ReviewStratum } from '../shared/review.types';

const INCREASED = 'characteristic-increased';
const DECREASED = 'characteristic-decreased';

/**
 * The two directions a player's stored characteristics can differ from the
 * baseline their position carries under their era's rules set. Either is
 * legitimate — an advancement raises a characteristic, an injury lowers one —
 * so neither stratum decides anything; they exist so a run always contains
 * players whose values are *not* simply their position's, which is where a
 * mis-parsed stat line or a botched reconstruction shows up.
 *
 * The baseline is joined through the era's *last-listed* rules set
 * (`max(era_rules_sets.id)` for the era), the same DB-only resolution
 * `PlayerCharacteristicsDbRendererService` uses and for the same reason: this
 * tool must not read the importers' configs. A player whose era resolves to
 * no rules set, or whose position has no row for it, is excluded by the inner
 * joins — there is nothing to compare against.
 *
 * Comparison is numeric, not "better/worse": under BB2020 a lower Agility is
 * a better Agility, and which is which is the reviewer's call. Passing is
 * compared only where both sides have one, so a rules set without Passing
 * never makes every one of its players match. Note that a player whose
 * characteristics were never imported still carries the `players` table's
 * placeholder zeroes and will surface as decreased — which is exactly the
 * kind of gap this tool exists to show.
 */
@Injectable()
export class CharacteristicsChangeStratificationService implements PlayerStratifier {
  private readonly strata: readonly ReviewStratum[] = [
    {
      id: INCREASED,
      label:
        'Player has a characteristic increased above their position baseline',
      sources: ['bbl', 'tp'],
    },
    {
      id: DECREASED,
      label:
        'Player has a characteristic decreased below their position baseline',
      sources: ['bbl', 'tp'],
    },
  ];

  constructor(
    private readonly externalSystems: ExternalSystemLookupService,
    private readonly query: PlayerProjectionQueryService,
  ) {}

  listStrata(): ReviewStratum[] {
    return [...this.strata];
  }

  async sampleStratum({
    source,
    stratumId,
    limit,
  }: StratumSampleRequest): Promise<ReviewPlayer[]> {
    const condition = this.filterFor(stratumId);
    const externalSystemId = await this.externalSystems.getSystemId(source);
    const latest = alias(eraRulesSets, 'latest_era_rules_sets');
    const rows = await this.query
      .base(externalSystemId)
      .innerJoin(
        eraRulesSets,
        and(
          eq(eraRulesSets.eraId, teamEras.eraId),
          // The era's last-listed rules set: era_rules_sets rows are inserted
          // in the order the importers' own configs list them, so the highest
          // id for an era is what those configs mean by "last-listed".
          sql`${eraRulesSets.id} = (select max(${latest.id}) from ${latest} where ${latest.eraId} = ${teamEras.eraId})`,
        ),
      )
      .innerJoin(
        positionRulesSets,
        and(
          eq(positionRulesSets.positionId, players.positionId),
          eq(positionRulesSets.rulesSetId, eraRulesSets.rulesSetId),
        ),
      )
      .where(condition)
      .orderBy(sql`random()`)
      .limit(limit);
    return rows.map((row) => ({ source, ...row }));
  }

  /** At least one characteristic differing in this stratum's direction. */
  private filterFor(stratumId: string): SQL {
    if (stratumId === INCREASED) {
      return this.comparison(gt);
    }
    if (stratumId === DECREASED) {
      return this.comparison(lt);
    }
    throw new Error(
      `Unknown player stratum "${stratumId}". Known strata: ` +
        `${INCREASED}, ${DECREASED}.`,
    );
  }

  /**
   * The same five-column comparison in either direction. Passing is guarded
   * by both NOT NULLs: a null on either side is not a numeric difference, and
   * SQL would evaluate the comparison to NULL there anyway.
   */
  private comparison(compare: typeof gt): SQL {
    return or(
      compare(players.move, positionRulesSets.move),
      compare(players.strength, positionRulesSets.strength),
      compare(players.agility, positionRulesSets.agility),
      compare(players.armour, positionRulesSets.armour),
      and(
        isNotNull(players.passing),
        isNotNull(positionRulesSets.passing),
        compare(players.passing, positionRulesSets.passing),
      ),
    ) as SQL;
  }
}
