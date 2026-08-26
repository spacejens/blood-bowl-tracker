import {
  eraRulesSets,
  eras,
  matchEvents,
  playerExternalIds,
  players,
  positions,
  sppAwardValues,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import { Injectable } from '@nestjs/common';
import { and, eq, isNotNull, sql } from 'drizzle-orm';

import { ExternalSystemLookupService } from '../shared/external-system-lookup.service';
import { PlayerProjectionQueryService } from '../shared/player-projection-query.service';
import type {
  PlayerStratifier,
  StratumSampleRequest,
} from '../shared/player-stratifier';
import type { ReviewPlayer, ReviewStratum } from '../shared/review.types';

const NON_STANDARD_STRATUM = 'spp-non-standard-contribution';

/**
 * Players with at least one match event whose recorded SPP contribution
 * disagrees with the standardised award table.
 *
 * TP-only: a BBL-sourced event's `spp_value` is computed from
 * `spp_award_values` by construction and can never disagree, while a
 * TP-sourced one carries TP's own reported figure verbatim, which may
 * legitimately differ. Whether a difference is a bug or normal TP variation is
 * the reviewer's judgment, not this stratum's.
 *
 * The expected award is re-derived here rather than borrowed, because
 * review-player must never depend on `packages/game-data` (see
 * docs/review-player/index.md) — code under review agreeing with itself is
 * what this tool exists to prevent. The correlated subquery orders NULL races
 * last so a race-specific row wins over the baseline it overrides.
 *
 * An action type with no matching row (`foul` never has one) is an expected
 * award of 0, not "no answer", hence the outer `coalesce`; a NULL `spp_value`
 * reads as 0 too, so a valueless touchdown is flagged and a valueless foul is
 * not.
 *
 * Bounded by the caller's limit, unlike the discrepancy stratum: the match
 * definition is deliberately broad and would otherwise flood the report.
 */
@Injectable()
export class SppNonStandardContributionStratificationService implements PlayerStratifier {
  private readonly strata: readonly ReviewStratum[] = [
    {
      id: NON_STANDARD_STRATUM,
      label: 'Non-standard SPP per event',
      sources: ['tp'],
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
    if (stratumId !== NON_STANDARD_STRATUM) {
      throw new Error(
        `Unknown player stratum "${stratumId}". Known strata: ${NON_STANDARD_STRATUM}.`,
      );
    }
    const externalSystemId = await this.externalSystems.getSystemId(source);
    const expected = sql<number>`coalesce((
      select ${sppAwardValues.sppValue}
      from ${sppAwardValues}
      inner join ${eraRulesSets}
        on ${eraRulesSets.rulesSetId} = ${sppAwardValues.rulesSetId}
      where ${eraRulesSets.eraId} = ${teamEras.eraId}
        and ${sppAwardValues.actionType} = ${matchEvents.actionType}
        and (${sppAwardValues.raceId} is null
             or ${sppAwardValues.raceId} = ${teams.raceId})
      order by ${sppAwardValues.raceId} nulls last
      limit 1
    ), 0)`;
    const rows = await this.query
      .base(externalSystemId)
      .innerJoin(
        matchEvents,
        and(
          eq(matchEvents.actingPlayerId, players.id),
          isNotNull(matchEvents.actionType),
        ),
      )
      .where(
        sql`coalesce(${matchEvents.sppValue}, 0) is distinct from ${expected}`,
      )
      .groupBy(
        players.id,
        players.name,
        playerExternalIds.externalId,
        teams.name,
        positions.name,
        eras.name,
      )
      .orderBy(sql`random()`)
      .limit(limit);
    return rows.map((row) => ({ source, ...row }));
  }
}
