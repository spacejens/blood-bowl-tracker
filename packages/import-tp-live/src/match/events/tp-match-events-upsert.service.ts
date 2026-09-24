import type { ImportError } from '@blood-bowl-tracker/api-contract';
import {
  MatchEventsService,
  PlayersService,
} from '@blood-bowl-tracker/game-data';
import type { TpMatch } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import { TpUpsertRunnerService } from '../../tp-upsert-runner.service';
import type { TpMatchContext } from '../tp-match-context.service';
import { TpMatchEventsBuilderService } from './tp-match-events-builder.service';
import type { TeamEra } from './tp-match-events-builder.types';
import { TpMatchEventsCorrelationService } from './tp-match-events-correlation.service';

/** Options for {@link TpMatchEventsUpsertService.upsertEvents}. */
export interface UpsertTpMatchEventsOptions {
  match: TpMatch;
  /** The match's database id. */
  matchId: number;
  context: TpMatchContext;
  errors: ImportError[];
}

@Injectable()
export class TpMatchEventsUpsertService {
  constructor(
    private readonly eventsBuilder: TpMatchEventsBuilderService,
    private readonly eventsCorrelation: TpMatchEventsCorrelationService,
    private readonly players: PlayersService,
    private readonly matchEvents: MatchEventsService,
    private readonly runner: TpUpsertRunnerService,
  ) {}

  /**
   * Imports every modeled event of one match. TP embeds the acting/victim
   * player and team on each attribution-bearing event, except casualties and
   * fouls, whose action and consequence are separate events and are paired
   * first (see TpMatchEventsCorrelationService). Players are resolved by
   * their TP `lineUpId` — every player the match's roster snapshots or
   * events name — so a player imported by any earlier roster import is
   * found. An unresolved player is a non-fatal error: the field is omitted
   * and the event still upserts. The match's teams must already be linked,
   * since an event upsert resolves teams through them. Resolves to the
   * number of rows written; a failed row records one error and the rest
   * still upsert.
   */
  async upsertEvents({
    match,
    matchId,
    context,
    errors,
  }: UpsertTpMatchEventsOptions): Promise<number> {
    const playerIdsByLineUpId = await this.resolvePlayerIds(match, context);
    const teamErasByRosterId = new Map<number, TeamEra[]>([
      [
        match.homeTeamTpId,
        [{ id: context.homeTeamEraId, eraId: context.eraId }],
      ],
      [
        match.awayTeamTpId,
        [{ id: context.awayTeamEraId, eraId: context.eraId }],
      ],
    ]);
    const casualtyPairing = this.eventsCorrelation.correlateCasualties(
      match.matchEvents,
    );
    const foulPairing = this.eventsCorrelation.correlateFouls(
      match.matchEvents,
      casualtyPairing,
    );

    let imported = 0;
    for (const event of match.matchEvents) {
      const dataList = this.eventsBuilder.buildEventData({
        event,
        matchId,
        eraId: context.eraId,
        tpSystemId: context.tpSystemId,
        teamErasByRosterId,
        playerIdsByLineUpId,
        homeTeamEraId: context.homeTeamEraId,
        awayTeamEraId: context.awayTeamEraId,
        errors,
        casualtyPairing,
        foulPairing,
      });
      for (const data of dataList) {
        const eventId = data.externalIds[0].externalId;
        const upserted = await this.runner.record({
          run: () => this.matchEvents.upsert(data),
          item: { match: match.id, event: eventId },
          errors,
          buildErrorMessage: (error) =>
            `Failed to upsert event ${eventId} of match ${match.id}: ${this.runner.messageOf(error)}`,
        });
        if (upserted !== undefined) {
          imported += 1;
        }
      }
    }
    return imported;
  }

  /** DB player id by TP `lineUpId`, for every player the match names. */
  private async resolvePlayerIds(
    match: TpMatch,
    context: TpMatchContext,
  ): Promise<Map<number, number>> {
    const lineUpIds = [
      ...new Set([
        ...match.homeRosterPlayers.map((player) => player.id),
        ...match.awayRosterPlayers.map((player) => player.id),
        ...match.matchEvents.flatMap((event) =>
          'lineUpId' in event ? [event.lineUpId] : [],
        ),
      ]),
    ];
    const playerIds = new Map<number, number>();
    if (lineUpIds.length === 0) {
      return playerIds;
    }
    const resolved = await this.players.resolveBatch(
      lineUpIds.map((lineUpId) => ({
        externalSystemId: context.tpSystemId,
        externalId: String(lineUpId),
      })),
    );
    lineUpIds.forEach((lineUpId, index) => {
      const result = resolved[index];
      if (result.found) {
        playerIds.set(lineUpId, result.id);
      }
    });
    return playerIds;
  }
}
