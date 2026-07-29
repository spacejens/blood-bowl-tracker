import type { Db } from '@blood-bowl-tracker/db';
import {
  competitions,
  DB,
  matches,
  matchEvents,
  matchExternalIds,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import type { SQL } from 'drizzle-orm';
import { and, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';

import { ExternalSystemLookupService } from '../shared/external-system-lookup.service';
import type {
  MatchStratifier,
  StratumSampleRequest,
} from '../shared/match-stratifier';
import type { ReviewMatch, ReviewStratum } from '../shared/review.types';

/** The casualty-family severities stratum 2 looks for. */
const CASUALTY_CONSEQUENCE_TYPES = [
  'casualty',
  'badly_hurt',
  'serious_injury',
  'death',
] as const;

/**
 * Picks the matches whose imported match events are worth eyeballing: a few
 * per interesting case, per source. Strata are deliberately about the
 * *interpretation* decisions the importers make (foul attribution, casualty
 * severity, action/consequence correlation, unidentified participants,
 * avoided casualties), because those are what a human is reviewing.
 */
@Injectable()
export class MatchEventStratificationService implements MatchStratifier {
  private readonly strata: readonly ReviewStratum[] = [
    { id: 'foul', label: 'Contains a foul', sources: ['bbl', 'tp'] },
    {
      id: 'casualty',
      label: 'Contains a casualty or death',
      sources: ['bbl', 'tp'],
    },
    {
      id: 'paired',
      label: 'Action paired with a matched consequence',
      sources: ['bbl', 'tp'],
    },
    {
      id: 'unpaired',
      label: 'Action without a matched consequence',
      sources: ['bbl', 'tp'],
    },
    {
      // BBL-only: TP resolves every journeyman, star, and mercenary
      // participant to a real player row via lineUpId, so it has no
      // name-only/unidentified participant to describe in the first place.
      id: 'unidentified',
      label: 'Journeyman, star or mercenary participant',
      sources: ['bbl'],
    },
    {
      // BBL-only: TP's data has no apothecary/regeneration annotation.
      id: 'avoided',
      label: 'Consequence avoided (apothecary or regeneration)',
      sources: ['bbl'],
    },
  ];

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly externalSystems: ExternalSystemLookupService,
  ) {}

  listStrata(): ReviewStratum[] {
    return [...this.strata];
  }

  async sampleStratum({
    source,
    stratumId,
    limit,
  }: StratumSampleRequest): Promise<ReviewMatch[]> {
    const condition = this.condition(stratumId);
    const externalSystemId = await this.externalSystems.getSystemId(source);
    // GROUP BY, not SELECT DISTINCT: one row per match (matching event rows
    // never differ across these columns), but unlike DISTINCT it doesn't
    // require ORDER BY expressions to appear in the select list, so `random()`
    // is allowed directly here.
    const rows = await this.db
      .select({
        matchId: matches.id,
        // Every external id for the match, not just `matchExternalIds.externalId`:
        // a merged BBL match has two external-id rows for the same match
        // under the same system, and grouping by the raw column would
        // surface it as two rows here — halving its effective sample and
        // dropping one of the merge's two source pages from the report.
        // `array_agg` (ordered numerically, not lexicographically) collects
        // both ids instead of collapsing to one, matching
        // `MergedMatchStratificationService`'s approach. Not DISTINCT: this
        // query joins matchEvents (many rows per match) against
        // matchExternalIds (one row per external id), so each external id
        // repeats once per event row -- Postgres also rejects
        // `array_agg(DISTINCT ... ORDER BY x::integer)` outright (the ORDER
        // BY expression must match the DISTINCT argument exactly). Dedup
        // happens in JS below instead, after the numeric ordering is already
        // applied.
        externalIds: sql<
          string[]
        >`array_agg(${matchExternalIds.externalId} order by ${matchExternalIds.externalId}::integer)`,
        matchName: matches.name,
        competitionName: competitions.name,
        playedAt: matches.playedAt,
        category: matches.category,
      })
      .from(matchEvents)
      .innerJoin(matches, eq(matches.id, matchEvents.matchId))
      .innerJoin(competitions, eq(competitions.id, matches.competitionId))
      .innerJoin(
        matchExternalIds,
        and(
          eq(matchExternalIds.matchId, matches.id),
          eq(matchExternalIds.externalSystemId, externalSystemId),
        ),
      )
      .where(condition)
      .groupBy(
        matches.id,
        matches.name,
        competitions.name,
        matches.playedAt,
        matches.category,
      )
      // Random, not newest-first: every stratum querying "the same handful
      // of most recent matches" would otherwise collapse a large sample
      // into a handful of overlapping matches, defeating the point of
      // sampling several strata in the first place.
      .orderBy(sql`random()`)
      .limit(limit);

    // Numerically ascending above, so the lower id is first — matching the
    // importer's own "primary = numerically lower id" convention. `Set`
    // dedups the per-event-row repeats while preserving that order.
    return rows.map(({ externalIds, ...row }) => {
      const uniqueExternalIds = [...new Set(externalIds)];
      return {
        source,
        ...row,
        externalId: uniqueExternalIds[0],
        secondaryExternalId: uniqueExternalIds[1],
      };
    });
  }

  /** The `WHERE` clause for one stratum, over a single match_events row. */
  private condition(stratumId: string): SQL {
    switch (stratumId) {
      case 'foul':
        return eq(matchEvents.actionType, 'foul');
      case 'casualty':
        return inArray(matchEvents.consequenceType, [
          ...CASUALTY_CONSEQUENCE_TYPES,
        ]);
      case 'paired':
        return and(
          isNotNull(matchEvents.actingPlayerId),
          isNotNull(matchEvents.consequencePlayerId),
        ) as SQL;
      case 'unpaired':
        return or(
          and(
            isNotNull(matchEvents.actingPlayerId),
            isNull(matchEvents.consequencePlayerId),
          ),
          and(
            isNull(matchEvents.actingPlayerId),
            isNotNull(matchEvents.consequencePlayerId),
          ),
        ) as SQL;
      case 'unidentified':
        return or(
          isNotNull(matchEvents.actingUnidentifiedKind),
          isNotNull(matchEvents.consequenceUnidentifiedKind),
        ) as SQL;
      case 'avoided':
        return isNotNull(matchEvents.consequenceAvoidedBy);
      default:
        throw new Error(
          `Unknown match-event stratum "${stratumId}". Known strata: ` +
            `${this.strata.map((stratum) => stratum.id).join(', ')}.`,
        );
    }
  }
}
