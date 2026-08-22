import type { UpsertMatchEvent } from '@blood-bowl-tracker/api-contract';
import type { TpMatchEvent } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import type {
  BuildEventDataOptions,
  TeamEra,
} from './tp-match-events-builder.types';

interface ResolveTeamEraOptions {
  teamErasByRosterId: Map<number, TeamEra[]>;
  rosterId: number;
  eraId: number;
}

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
  /** Resolve a roster id + era id to its team_eras id, or undefined. */
  private resolveTeamEraId(options: ResolveTeamEraOptions): number | undefined {
    return options.teamErasByRosterId
      .get(options.rosterId)
      ?.find((teamEra) => teamEra.eraId === options.eraId)?.id;
  }

  private externalIdEntry(
    tpSystemId: number,
    tpEventId: number,
    suffix?: 'home' | 'away',
  ): UpsertMatchEvent['externalIds'][number] {
    const id = suffix ? `tp-${tpEventId}-${suffix}` : `tp-${tpEventId}`;
    return { externalSystemId: tpSystemId, externalId: id };
  }

  private externalId(
    tpSystemId: number,
    tpEventId: number,
    suffix?: 'home' | 'away',
  ): UpsertMatchEvent['externalIds'] {
    return [this.externalIdEntry(tpSystemId, tpEventId, suffix)];
  }

  /**
   * Set `data[key]` to `value` when it's resolved, leaving it `undefined`
   * (omitted, written as `null` by the server) otherwise. Mirrors the
   * identically-named helper on `TpMatchEventKindBuildersService`.
   */
  private setIfDefined<K extends keyof UpsertMatchEvent>(
    data: UpsertMatchEvent,
    key: K,
    value: UpsertMatchEvent[K] | undefined,
  ): void {
    if (value !== undefined) {
      data[key] = value;
    }
  }

  /**
   * Build the administrative TP match events (weather, inducements, winnings,
   * fan factor, journeyman signing, expensive mistake, dedicated fans, secret
   * objective, prayers to Nuffle, concession) for one event, per the mapping
   * table in the Task 9 plan (as amended by the round-1 review brief). Weather
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
      this.resolveTeamEraId({ teamErasByRosterId, rosterId, eraId });

    switch (event.type) {
      case 'weather_roll': {
        return [
          {
            matchId,
            eventType: 'weather',
            weatherType: event.weatherType,
            externalIds: this.externalId(tpSystemId, event.tpEventId),
          },
        ];
      }
      case 'inducements_roll': {
        const data: UpsertMatchEvent = {
          matchId,
          actionType: 'inducements',
          inducementsCost: event.totalCost,
          externalIds: this.externalId(tpSystemId, event.tpEventId),
        };
        this.setIfDefined(
          data,
          'actingTeamEraId',
          actingTeamEraId(event.rosterId),
        );
        this.setIfDefined(data, 'inducementsFromTreasury', event.fromTreasury);
        return [data];
      }
      case 'journeyman_signing': {
        const data: UpsertMatchEvent = {
          matchId,
          actionType: 'journeymen_signings',
          journeymenCount: event.journeymenCount,
          externalIds: this.externalId(tpSystemId, event.tpEventId),
        };
        this.setIfDefined(
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
          externalIds: this.externalId(tpSystemId, event.tpEventId),
        };
        this.setIfDefined(
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
          externalIds: this.externalId(tpSystemId, event.tpEventId),
        };
        this.setIfDefined(
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
          externalIds: this.externalId(tpSystemId, event.tpEventId, 'home'),
        };
        this.setIfDefined(home, 'actingTeamEraId', homeTeamEraId);
        const away: UpsertMatchEvent = {
          matchId,
          actionType: 'winnings',
          winnings: event.visitorWinnings,
          externalIds: this.externalId(tpSystemId, event.tpEventId, 'away'),
        };
        this.setIfDefined(away, 'actingTeamEraId', awayTeamEraId);
        return [home, away];
      }
      case 'fan_factor_roll': {
        const home: UpsertMatchEvent = {
          matchId,
          actionType: 'fan_factor',
          fanFactor: event.fanFactorLocal,
          externalIds: this.externalId(tpSystemId, event.tpEventId, 'home'),
        };
        this.setIfDefined(home, 'actingTeamEraId', homeTeamEraId);
        const away: UpsertMatchEvent = {
          matchId,
          actionType: 'fan_factor',
          fanFactor: event.fanFactorVisitor,
          externalIds: this.externalId(tpSystemId, event.tpEventId, 'away'),
        };
        this.setIfDefined(away, 'actingTeamEraId', awayTeamEraId);
        return [home, away];
      }
      case 'dedicated_fans_roll': {
        const events: UpsertMatchEvent[] = [];
        if (event.dedicatedFansModifierLocal !== 0) {
          const home: UpsertMatchEvent = {
            matchId,
            consequenceType: 'dedicated_fans',
            dedicatedFans: event.dedicatedFansModifierLocal,
            externalIds: this.externalId(tpSystemId, event.tpEventId, 'home'),
          };
          this.setIfDefined(home, 'consequenceTeamEraId', homeTeamEraId);
          events.push(home);
        }
        if (event.dedicatedFansModifierVisitor !== 0) {
          const away: UpsertMatchEvent = {
            matchId,
            consequenceType: 'dedicated_fans',
            dedicatedFans: event.dedicatedFansModifierVisitor,
            externalIds: this.externalId(tpSystemId, event.tpEventId, 'away'),
          };
          this.setIfDefined(away, 'consequenceTeamEraId', awayTeamEraId);
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
            externalIds: this.externalId(tpSystemId, event.tpEventId),
          },
        ];
      }
      case 'concession': {
        const data: UpsertMatchEvent = {
          matchId,
          consequenceType: 'concession',
          externalIds: this.externalId(tpSystemId, event.tpEventId),
        };
        const concedingTeamEraId = event.concedeLocal
          ? homeTeamEraId
          : event.concedeVisitor
            ? awayTeamEraId
            : undefined;
        this.setIfDefined(data, 'consequenceTeamEraId', concedingTeamEraId);
        return [data];
      }
    }
  }
}
