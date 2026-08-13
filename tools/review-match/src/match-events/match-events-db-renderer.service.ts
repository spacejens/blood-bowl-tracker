import type { Db } from '@blood-bowl-tracker/db';
import {
  DB,
  matchEventExternalIds,
  matchEvents,
  matchTeams,
  players,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import type { TableCell } from '@blood-bowl-tracker/review-harness';
import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { ExternalSystemLookupService } from '../shared/external-system-lookup.service';
import type { SampledMatch } from '../shared/review.types';

// Acting and consequence participants are two independent walks of the same
// player/match-team/team-era/team chain, so each needs its own alias.
const actingPlayer = alias(players, 'acting_player');
const consequencePlayer = alias(players, 'consequence_player');
const actingMatchTeam = alias(matchTeams, 'acting_match_team');
const consequenceMatchTeam = alias(matchTeams, 'consequence_match_team');
const actingTeamEra = alias(teamEras, 'acting_team_era');
const consequenceTeamEra = alias(teamEras, 'consequence_team_era');
const actingTeam = alias(teams, 'acting_team');
const consequenceTeam = alias(teams, 'consequence_team');

const NONE = '—';

const HEADERS: TableCell[] = [
  'DB id',
  'External ID',
  ['Action /', 'Consequence'],
  'Event',
  'Acting player',
  'Acting team',
  'Consequence player',
  'Consequence team',
  'Details',
];

/** One `game_data.match_events` row, flattened for display. */
interface EventRow {
  id: number;
  actionType: string | null;
  consequenceType: string | null;
  eventType: string | null;
  actingPlayerName: string | null;
  actingTeamName: string | null;
  consequencePlayerName: string | null;
  consequenceTeamName: string | null;
  actingUnidentifiedKind: string | null;
  consequenceUnidentifiedKind: string | null;
  consequenceAvoidedBy: string | null;
  consequenceAvoidedSeverity: string | null;
  weatherType: string | null;
  secretObjective: string | null;
  inducementsCost: number | null;
  inducementsFromTreasury: number | null;
  winnings: number | null;
  fanFactor: number | null;
  journeymenCount: number | null;
  prayersToNuffle: number | null;
  dedicatedFans: number | null;
  expensiveMistake: number | null;
}

/**
 * Renders what the importer actually stored for one match: every
 * `game_data.match_events` row, with participants resolved to player and team
 * names so it can be compared against the source page by eye.
 *
 * `HtmlService` is injected as a real provider in this service's spec: it is a
 * pure formatter with its own tests, and mocking it would leave the rendered
 * output unasserted.
 */
@Injectable()
export class MatchEventsDbRendererService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly externalSystems: ExternalSystemLookupService,
    private readonly html: HtmlService,
  ) {}

  async render(match: SampledMatch): Promise<string> {
    const externalSystemId = await this.externalSystems.getSystemId(
      match.source,
    );
    const rows = await this.load(match);
    if (rows.length === 0) {
      return this.html.note('No match events imported for this match.');
    }
    const externalIdsByEventId = await this.loadExternalIds(
      match,
      externalSystemId,
    );
    return this.html.table(
      HEADERS,
      rows.map((row): TableCell[] => {
        const externalIds = externalIdsByEventId.get(row.id) ?? [];
        return [
          String(row.id),
          externalIds.length > 0 ? externalIds : NONE,
          [row.actionType ?? NONE, row.consequenceType ?? NONE],
          row.eventType ?? NONE,
          row.actingPlayerName ?? NONE,
          row.actingTeamName ?? NONE,
          row.consequencePlayerName ?? NONE,
          row.consequenceTeamName ?? NONE,
          this.details(row),
        ];
      }),
    );
  }

  private async load(match: SampledMatch): Promise<EventRow[]> {
    return this.db
      .select({
        id: matchEvents.id,
        actionType: matchEvents.actionType,
        consequenceType: matchEvents.consequenceType,
        eventType: matchEvents.eventType,
        actingPlayerName: actingPlayer.name,
        actingTeamName: actingTeam.name,
        consequencePlayerName: consequencePlayer.name,
        consequenceTeamName: consequenceTeam.name,
        actingUnidentifiedKind: matchEvents.actingUnidentifiedKind,
        consequenceUnidentifiedKind: matchEvents.consequenceUnidentifiedKind,
        consequenceAvoidedBy: matchEvents.consequenceAvoidedBy,
        consequenceAvoidedSeverity: matchEvents.consequenceAvoidedSeverity,
        weatherType: matchEvents.weatherType,
        secretObjective: matchEvents.secretObjective,
        inducementsCost: matchEvents.inducementsCost,
        inducementsFromTreasury: matchEvents.inducementsFromTreasury,
        winnings: matchEvents.winnings,
        fanFactor: matchEvents.fanFactor,
        journeymenCount: matchEvents.journeymenCount,
        prayersToNuffle: matchEvents.prayersToNuffle,
        dedicatedFans: matchEvents.dedicatedFans,
        expensiveMistake: matchEvents.expensiveMistake,
      })
      .from(matchEvents)
      .leftJoin(actingPlayer, eq(actingPlayer.id, matchEvents.actingPlayerId))
      .leftJoin(
        consequencePlayer,
        eq(consequencePlayer.id, matchEvents.consequencePlayerId),
      )
      .leftJoin(
        actingMatchTeam,
        eq(actingMatchTeam.id, matchEvents.actingMatchTeamId),
      )
      .leftJoin(actingTeamEra, eq(actingTeamEra.id, actingMatchTeam.teamEraId))
      .leftJoin(actingTeam, eq(actingTeam.id, actingTeamEra.teamId))
      .leftJoin(
        consequenceMatchTeam,
        eq(consequenceMatchTeam.id, matchEvents.consequenceMatchTeamId),
      )
      .leftJoin(
        consequenceTeamEra,
        eq(consequenceTeamEra.id, consequenceMatchTeam.teamEraId),
      )
      .leftJoin(
        consequenceTeam,
        eq(consequenceTeam.id, consequenceTeamEra.teamId),
      )
      .where(eq(matchEvents.matchId, match.matchId))
      .orderBy(asc(matchEvents.id));
  }

  /**
   * Every external id each of this match's events carries under the sampled
   * source's external system, aggregated per event. A separate query rather
   * than a join on the main one: an event can carry more than one id (a merged
   * BBL event records one per side), and joining would duplicate the event row
   * instead of showing both ids.
   */
  private async loadExternalIds(
    match: SampledMatch,
    externalSystemId: number,
  ): Promise<Map<number, string[]>> {
    const rows = await this.db
      .select({
        matchEventId: matchEventExternalIds.matchEventId,
        externalIds: sql<
          string[]
        >`array_agg(${matchEventExternalIds.externalId} order by ${matchEventExternalIds.externalId})`,
      })
      .from(matchEventExternalIds)
      .innerJoin(
        matchEvents,
        eq(matchEvents.id, matchEventExternalIds.matchEventId),
      )
      .where(
        and(
          eq(matchEvents.matchId, match.matchId),
          eq(matchEventExternalIds.externalSystemId, externalSystemId),
        ),
      )
      .groupBy(matchEventExternalIds.matchEventId);
    return new Map(rows.map((row) => [row.matchEventId, row.externalIds]));
  }

  /** Every remaining non-null scalar, as `key=value`, in a stable order. */
  private details(row: EventRow): string {
    const pairs: [string, string | number | null][] = [
      ['acting_unidentified', row.actingUnidentifiedKind],
      ['consequence_unidentified', row.consequenceUnidentifiedKind],
      ['avoided_by', row.consequenceAvoidedBy],
      ['avoided_severity', row.consequenceAvoidedSeverity],
      ['weather', row.weatherType],
      ['secret_objective', row.secretObjective],
      ['inducements_cost', row.inducementsCost],
      ['inducements_from_treasury', row.inducementsFromTreasury],
      ['winnings', row.winnings],
      ['fan_factor', row.fanFactor],
      ['journeymen', row.journeymenCount],
      ['prayers_to_nuffle', row.prayersToNuffle],
      ['dedicated_fans', row.dedicatedFans],
      ['expensive_mistake', row.expensiveMistake],
    ];
    const details = pairs
      .filter(([, value]) => value !== null && value !== undefined)
      .map(([key, value]) => `${key}=${String(value)}`);
    return details.length > 0 ? details.join(', ') : NONE;
  }
}
