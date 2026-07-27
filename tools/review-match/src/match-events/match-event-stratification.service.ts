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
import { and, desc, eq, inArray, isNotNull, isNull, or } from 'drizzle-orm';

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
      id: 'unidentified',
      label: 'Journeyman, star or mercenary participant',
      sources: ['bbl', 'tp'],
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
    const rows = await this.db
      .selectDistinct({
        matchId: matches.id,
        externalId: matchExternalIds.externalId,
        matchName: matches.name,
        competitionName: competitions.name,
        playedAt: matches.playedAt,
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
      .orderBy(desc(matches.playedAt))
      .limit(limit);

    return rows.map((row) => ({ source, ...row }));
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
