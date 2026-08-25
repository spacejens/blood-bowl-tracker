import type { UpsertMatchEvent } from '@blood-bowl-tracker/api-contract';
import type { TpMatchEvent } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import { TpMatchEventHelpersService } from './tp-match-event-helpers.service';
import type { BuildEventDataOptions } from './tp-match-events-builder.types';

/**
 * Every administrative TP match event kind — everything except the
 * gameplay events (touchdown, injury, mvp_award, and the seven other simple
 * action kinds, plus casualty_caused and sent_off), which are all built by
 * their own dedicated methods on {@link TpMatchEventKindBuildersService}
 * rather than {@link TpAdminMatchEventBuilderService.buildAdminEvents}.
 */
export type TpAdminMatchEvent = Exclude<
  TpMatchEvent,
  | { type: 'touchdown' }
  | { type: 'completion' }
  | { type: 'interception' }
  | { type: 'deflection' }
  | { type: 'foul' }
  | { type: 'mvp_award' }
  | { type: 'successful_landing' }
  | { type: 'throw_team_mate' }
  | { type: 'catch' }
  | { type: 'sent_off' }
  | { type: 'casualty_caused' }
  | { type: 'injury' }
>;

/**
 * Builds the administrative TP match events. Split out of
 * `TpMatchEventKindBuildersService` (which delegates its own
 * `buildAdminEvents` to this service unchanged) purely to stay under this
 * repo's 500-line source file ceiling — conceptually this is still a
 * private implementation detail of the kind builders, just hosted in its
 * own collaborating service.
 */
@Injectable()
export class TpAdminMatchEventBuilderService {
  constructor(private readonly helpers: TpMatchEventHelpersService) {}

  /**
   * Build the administrative TP match events (weather, inducements, winnings,
   * fan factor, journeyman signing, expensive mistake, dedicated fans, secret
   * objective, prayers to Nuffle, concession) for one event. Weather
   * has no actor or consequence recipient, so it's classified via `eventType`
   * rather than `actionType`, and stays team-less/neutral. Single-team-scoped
   * events resolve their team era via `rosterId` under the match's era;
   * "both-sides" events (winnings, fan factor, dedicated fans) emit up to two
   * `UpsertMatchEvent`s using the match's already-resolved
   * `homeTeamEraId`/`awayTeamEraId`, with external ids suffixed
   * `-home`/`-away` — dedicated fans is consequence-scoped (it's an outcome,
   * not an action) and skips a side whose modifier is `0` (unchanged), so it
   * can return zero, one, or two events. Every other administrative event uses
   * a plain `tp-<tpEventId>` external id.
   */
  buildAdminEvents(
    options: BuildEventDataOptions & { event: TpAdminMatchEvent },
  ): UpsertMatchEvent[] {
    const {
      event,
      matchId,
      eraId,
      tpSystemId,
      teamErasByRosterId,
      homeTeamEraId,
      awayTeamEraId,
    } = options;
    const actingTeamEraId = (rosterId: number) =>
      this.helpers.resolveTeamEraId({ teamErasByRosterId, rosterId, eraId });

    switch (event.type) {
      case 'weather_roll': {
        return [
          {
            matchId,
            eventType: 'weather',
            weatherType: event.weatherType,
            externalIds: this.helpers.externalId(tpSystemId, event.tpEventId),
          },
        ];
      }
      case 'inducements_roll': {
        const data: UpsertMatchEvent = {
          matchId,
          actionType: 'inducements',
          inducementsCost: event.totalCost,
          externalIds: this.helpers.externalId(tpSystemId, event.tpEventId),
        };
        this.helpers.setIfDefined(
          data,
          'actingTeamEraId',
          actingTeamEraId(event.rosterId),
        );
        this.helpers.setIfDefined(
          data,
          'inducementsFromTreasury',
          event.fromTreasury,
        );
        return [data];
      }
      case 'journeyman_signing': {
        const data: UpsertMatchEvent = {
          matchId,
          actionType: 'journeymen_signings',
          journeymenCount: event.journeymenCount,
          externalIds: this.helpers.externalId(tpSystemId, event.tpEventId),
        };
        this.helpers.setIfDefined(
          data,
          'actingTeamEraId',
          actingTeamEraId(event.rosterId),
        );
        return [data];
      }
      case 'secret_objective': {
        const data: UpsertMatchEvent = {
          matchId,
          actionType: 'secret_objective',
          secretObjective: event.secretObjective,
          externalIds: this.helpers.externalId(tpSystemId, event.tpEventId),
        };
        this.helpers.setIfDefined(
          data,
          'actingTeamEraId',
          actingTeamEraId(event.rosterId),
        );
        return [data];
      }
      case 'expensive_mistake': {
        const data: UpsertMatchEvent = {
          matchId,
          consequenceType: 'expensive_mistake',
          expensiveMistake: event.expensiveMistake,
          externalIds: this.helpers.externalId(tpSystemId, event.tpEventId),
        };
        this.helpers.setIfDefined(
          data,
          'consequenceTeamEraId',
          actingTeamEraId(event.rosterId),
        );
        return [data];
      }
      case 'winnings_roll': {
        const home: UpsertMatchEvent = {
          matchId,
          actionType: 'winnings',
          winnings: event.localWinnings,
          externalIds: this.helpers.externalId(
            tpSystemId,
            event.tpEventId,
            'home',
          ),
        };
        this.helpers.setIfDefined(home, 'actingTeamEraId', homeTeamEraId);
        const away: UpsertMatchEvent = {
          matchId,
          actionType: 'winnings',
          winnings: event.visitorWinnings,
          externalIds: this.helpers.externalId(
            tpSystemId,
            event.tpEventId,
            'away',
          ),
        };
        this.helpers.setIfDefined(away, 'actingTeamEraId', awayTeamEraId);
        return [home, away];
      }
      case 'fan_factor_roll': {
        const home: UpsertMatchEvent = {
          matchId,
          actionType: 'fan_factor',
          fanFactor: event.fanFactorLocal,
          externalIds: this.helpers.externalId(
            tpSystemId,
            event.tpEventId,
            'home',
          ),
        };
        this.helpers.setIfDefined(home, 'actingTeamEraId', homeTeamEraId);
        const away: UpsertMatchEvent = {
          matchId,
          actionType: 'fan_factor',
          fanFactor: event.fanFactorVisitor,
          externalIds: this.helpers.externalId(
            tpSystemId,
            event.tpEventId,
            'away',
          ),
        };
        this.helpers.setIfDefined(away, 'actingTeamEraId', awayTeamEraId);
        return [home, away];
      }
      case 'dedicated_fans_roll': {
        const events: UpsertMatchEvent[] = [];
        if (event.dedicatedFansModifierLocal !== 0) {
          const home: UpsertMatchEvent = {
            matchId,
            consequenceType: 'dedicated_fans',
            dedicatedFans: event.dedicatedFansModifierLocal,
            externalIds: this.helpers.externalId(
              tpSystemId,
              event.tpEventId,
              'home',
            ),
          };
          this.helpers.setIfDefined(
            home,
            'consequenceTeamEraId',
            homeTeamEraId,
          );
          events.push(home);
        }
        if (event.dedicatedFansModifierVisitor !== 0) {
          const away: UpsertMatchEvent = {
            matchId,
            consequenceType: 'dedicated_fans',
            dedicatedFans: event.dedicatedFansModifierVisitor,
            externalIds: this.helpers.externalId(
              tpSystemId,
              event.tpEventId,
              'away',
            ),
          };
          this.helpers.setIfDefined(
            away,
            'consequenceTeamEraId',
            awayTeamEraId,
          );
          events.push(away);
        }
        return events;
      }
      case 'prayers_to_nuffle': {
        return [
          {
            matchId,
            actionType: 'prayers_to_nuffle',
            prayersToNuffle: event.prayersToNuffle,
            externalIds: this.helpers.externalId(tpSystemId, event.tpEventId),
          },
        ];
      }
      case 'concession': {
        const data: UpsertMatchEvent = {
          matchId,
          consequenceType: 'concession',
          externalIds: this.helpers.externalId(tpSystemId, event.tpEventId),
        };
        const concedingTeamEraId = event.concedeLocal
          ? homeTeamEraId
          : event.concedeVisitor
            ? awayTeamEraId
            : undefined;
        this.helpers.setIfDefined(
          data,
          'consequenceTeamEraId',
          concedingTeamEraId,
        );
        return [data];
      }
    }
  }
}
