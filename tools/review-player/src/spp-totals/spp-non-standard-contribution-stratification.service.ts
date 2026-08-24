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
 * TP-only. Per `match_events.spp_value`'s own doc comment in `packages/db`, a
 * BBL-sourced event's value is computed directly from `spp_award_values`, so
 * it can never disagree with that table by construction and querying BBL here
 * would always return nothing. A TP-sourced event instead carries TP's own
 * reported figure verbatim, which can legitimately differ (race-specific
 * modifiers, random events, special league rules). This
 * stratum surfaces the difference without judging whether it is a bug or
 * normal TP variation; that judgment is the reviewer's, from the rendered
 * comparison.
 *
 * The expected award is re-derived here rather than borrowed: review-player
 * must never depend on `packages/game-data` (see docs/review-player/index.md),
 * because code under review agreeing with itself is exactly what this tool
 * exists to prevent. The lookup mirrors the chain
 * `SppAwardValuesService.resolveSppValue` uses — player → team era → team →
 * era rules sets → award values, matched on `(rules_set_id, action_type)` with
 * either a NULL race (the baseline) or the team's own race — expressed as a
 * correlated subquery that orders NULL races last so a race-specific row wins
 * over the baseline it overrides.
 *
 * An action type with no matching row at all (`foul` never gets one — see
 * `spp_award_values`' own doc comment) is an expected award of 0, not "no
 * answer", hence the outer `coalesce`. A NULL `spp_value` is likewise read as
 * 0, so a touchdown recorded with no value is flagged while a `foul` with no
 * value is not.
 *
 * Bounded by the caller's limit, unlike the discrepancy stratum: the match
 * definition is deliberately broad, so an uncapped version could flag a large
 * share of TP players and flood the report instead of giving a reviewable
 * sample.
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
