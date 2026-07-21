import type {
  ConsequenceType,
  UpsertMatchEvent,
} from '@blood-bowl-tracker/api-contract';
import type { ImportError } from '@blood-bowl-tracker/import';
import { makeImportError } from '@blood-bowl-tracker/import';
import type { TpInjuryType, TpMatchEvent } from '@blood-bowl-tracker/parse-tp';

/** One resolved team_eras row: its DB id and the era it belongs to. */
export interface TeamEra {
  id: number;
  eraId: number;
}

interface ResolveTeamEraOptions {
  teamErasByRosterId: Map<number, TeamEra[]>;
  rosterId: number;
  eraId: number;
}

interface ResolvePlayerOptions {
  lineUpId: number;
  matchId: number;
  playerIdsByLineUpId: Map<number, number>;
  errors: ImportError[];
}

/** Every administrative (non touchdown/injury) TP match event kind. */
type TpAdminMatchEvent = Exclude<
  TpMatchEvent,
  { type: 'touchdown' } | { type: 'injury' }
>;

export interface BuildEventDataOptions {
  event: TpMatchEvent;
  matchId: number;
  eraId: number;
  tpSystemId: number;
  teamErasByRosterId: Map<number, TeamEra[]>;
  playerIdsByLineUpId: Map<number, number>;
  homeTeamEraId: number | undefined;
  awayTeamEraId: number | undefined;
  errors: ImportError[];
}

const INJURY_CONSEQUENCE_BY_TYPE: Record<
  Exclude<TpInjuryType, 'None'>,
  ConsequenceType
> = {
  MissNextGame: 'miss_next_game',
  NigglingInjury: 'niggling_injury',
  Dead: 'death',
  AV: 'stat_reduction_av',
  ST: 'stat_reduction_st',
  MA: 'stat_reduction_ma',
  PA: 'stat_reduction_pa',
  AG: 'stat_reduction_ag',
};

/** Resolve a roster id + era id to its team_eras id, or undefined. */
export function resolveTeamEraId(
  options: ResolveTeamEraOptions,
): number | undefined {
  return options.teamErasByRosterId
    .get(options.rosterId)
    ?.find((teamEra) => teamEra.eraId === options.eraId)?.id;
}

/**
 * Resolve a `lineUpId` to its imported player DB id. A `lineUpId` with no
 * imported id yields `undefined` and records a non-fatal error so the event
 * is still emitted with a null player, mirroring BBL's `resolvePlayerId`.
 */
function resolvePlayer(options: ResolvePlayerOptions): number | undefined {
  const { lineUpId, matchId, playerIdsByLineUpId, errors } = options;
  const id = playerIdsByLineUpId.get(lineUpId);
  if (id === undefined) {
    errors.push(
      makeImportError({
        item: { match: matchId, lineUpId },
        message: `Player lineUpId "${lineUpId}" in match "${matchId}" has no imported id; emitting the event with a null player.`,
      }),
    );
    return undefined;
  }
  return id;
}

/**
 * Map a TP `injuryType` to its `consequence_type`, or `undefined` for
 * `'None'` (no injury occurred).
 */
function injuryConsequence(
  injuryType: TpInjuryType,
): ConsequenceType | undefined {
  if (injuryType === 'None') {
    return undefined;
  }
  return INJURY_CONSEQUENCE_BY_TYPE[injuryType];
}

function externalId(
  tpSystemId: number,
  tpEventId: number,
  suffix?: 'home' | 'away',
): UpsertMatchEvent['externalIds'] {
  const id = suffix ? `tp-${tpEventId}-${suffix}` : `tp-${tpEventId}`;
  return [{ externalSystemId: tpSystemId, externalId: id }];
}

/**
 * Set `data[key]` to `value` when it's resolved, leaving it `undefined`
 * (omitted, written as `null` by the server) otherwise. Centralizing this
 * "set only when resolved" check in one place — rather than repeating an
 * `if` at every one of the ~15 call sites across the touchdown, injury, and
 * administrative-event builders — keeps branch coverage meaningful: one test
 * exercising an unresolved id and one exercising a resolved id together
 * cover every call site, instead of needing a pair of tests per site.
 */
function setIfDefined<K extends keyof UpsertMatchEvent>(
  data: UpsertMatchEvent,
  key: K,
  value: UpsertMatchEvent[K] | undefined,
): void {
  if (value !== undefined) {
    data[key] = value;
  }
}

function buildTouchdownEvent(
  options: BuildEventDataOptions & {
    event: Extract<TpMatchEvent, { type: 'touchdown' }>;
  },
): UpsertMatchEvent[] {
  const {
    event,
    matchId,
    eraId,
    tpSystemId,
    teamErasByRosterId,
    playerIdsByLineUpId,
    errors,
  } = options;
  const data: UpsertMatchEvent = {
    matchId,
    actionType: 'touchdown',
    externalIds: externalId(tpSystemId, event.tpEventId),
  };
  const actingTeamEraId = resolveTeamEraId({
    teamErasByRosterId,
    rosterId: event.rosterId,
    eraId,
  });
  setIfDefined(data, 'actingTeamEraId', actingTeamEraId);
  const actingPlayerId = resolvePlayer({
    lineUpId: event.lineUpId,
    matchId,
    playerIdsByLineUpId,
    errors,
  });
  setIfDefined(data, 'actingPlayerId', actingPlayerId);
  return [data];
}

function buildInjuryEvent(
  options: BuildEventDataOptions & {
    event: Extract<TpMatchEvent, { type: 'injury' }>;
  },
): UpsertMatchEvent[] {
  const {
    event,
    matchId,
    eraId,
    tpSystemId,
    teamErasByRosterId,
    playerIdsByLineUpId,
    errors,
  } = options;
  const consequenceType = injuryConsequence(event.injuryType);
  if (consequenceType === undefined) {
    return [];
  }
  const data: UpsertMatchEvent = {
    matchId,
    consequenceType,
    externalIds: externalId(tpSystemId, event.tpEventId),
  };
  const consequenceTeamEraId = resolveTeamEraId({
    teamErasByRosterId,
    rosterId: event.rosterId,
    eraId,
  });
  setIfDefined(data, 'consequenceTeamEraId', consequenceTeamEraId);
  const consequencePlayerId = resolvePlayer({
    lineUpId: event.lineUpId,
    matchId,
    playerIdsByLineUpId,
    errors,
  });
  setIfDefined(data, 'consequencePlayerId', consequencePlayerId);
  if (
    event.turnRosterId !== undefined &&
    event.turnRosterId !== event.rosterId
  ) {
    data.actionType = event.injuryType === 'Dead' ? 'death' : 'casualty';
    const actingTeamEraId = resolveTeamEraId({
      teamErasByRosterId,
      rosterId: event.turnRosterId,
      eraId,
    });
    setIfDefined(data, 'actingTeamEraId', actingTeamEraId);
  }
  return [data];
}

/**
 * Build the administrative TP match events (weather, inducements, winnings,
 * fan factor, journeyman signing, expensive mistake, dedicated fans, secret
 * objective, prayers to Nuffle, concession) for one event, per the mapping
 * table in the Task 9 plan. Single-team-scoped events resolve their team era
 * via `rosterId` under the match's era; "both-sides" events (winnings,
 * fan factor, dedicated fans) emit two `UpsertMatchEvent`s using the match's
 * already-resolved `homeTeamEraId`/`awayTeamEraId`, with external ids
 * suffixed `-home`/`-away`. Every other administrative event uses a plain
 * `tp-<tpEventId>` external id. Exactly one payload column is set per event.
 */
function buildAdminEvents(
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
    resolveTeamEraId({ teamErasByRosterId, rosterId, eraId });

  switch (event.type) {
    case 'weather_roll': {
      return [
        {
          matchId,
          actionType: 'weather_roll',
          weatherType: event.weatherType,
          externalIds: externalId(tpSystemId, event.tpEventId),
        },
      ];
    }
    case 'inducements_roll': {
      const data: UpsertMatchEvent = {
        matchId,
        actionType: 'inducements_roll',
        inducementsCost: event.totalCost,
        externalIds: externalId(tpSystemId, event.tpEventId),
      };
      setIfDefined(data, 'actingTeamEraId', actingTeamEraId(event.rosterId));
      return [data];
    }
    case 'journeyman_signing': {
      const data: UpsertMatchEvent = {
        matchId,
        actionType: 'journeyman_signing',
        journeymenCount: event.journeymenCount,
        externalIds: externalId(tpSystemId, event.tpEventId),
      };
      setIfDefined(data, 'actingTeamEraId', actingTeamEraId(event.rosterId));
      return [data];
    }
    case 'secret_objective': {
      const data: UpsertMatchEvent = {
        matchId,
        actionType: 'secret_objective',
        secretObjective: event.secretObjective,
        externalIds: externalId(tpSystemId, event.tpEventId),
      };
      setIfDefined(data, 'actingTeamEraId', actingTeamEraId(event.rosterId));
      return [data];
    }
    case 'expensive_mistake': {
      const data: UpsertMatchEvent = {
        matchId,
        consequenceType: 'expensive_mistake',
        expensiveMistake: event.expensiveMistake,
        externalIds: externalId(tpSystemId, event.tpEventId),
      };
      setIfDefined(
        data,
        'consequenceTeamEraId',
        actingTeamEraId(event.rosterId),
      );
      return [data];
    }
    case 'winnings_roll': {
      const home: UpsertMatchEvent = {
        matchId,
        actionType: 'winnings_roll',
        winnings: event.localWinnings,
        externalIds: externalId(tpSystemId, event.tpEventId, 'home'),
      };
      setIfDefined(home, 'actingTeamEraId', homeTeamEraId);
      const away: UpsertMatchEvent = {
        matchId,
        actionType: 'winnings_roll',
        winnings: event.visitorWinnings,
        externalIds: externalId(tpSystemId, event.tpEventId, 'away'),
      };
      setIfDefined(away, 'actingTeamEraId', awayTeamEraId);
      return [home, away];
    }
    case 'fan_factor_roll': {
      const home: UpsertMatchEvent = {
        matchId,
        actionType: 'fan_factor_roll',
        fanFactor: event.newFanFactorLocal,
        externalIds: externalId(tpSystemId, event.tpEventId, 'home'),
      };
      setIfDefined(home, 'actingTeamEraId', homeTeamEraId);
      const away: UpsertMatchEvent = {
        matchId,
        actionType: 'fan_factor_roll',
        fanFactor: event.newFanFactorVisitor,
        externalIds: externalId(tpSystemId, event.tpEventId, 'away'),
      };
      setIfDefined(away, 'actingTeamEraId', awayTeamEraId);
      return [home, away];
    }
    case 'dedicated_fans_roll': {
      const home: UpsertMatchEvent = {
        matchId,
        actionType: 'dedicated_fans_roll',
        dedicatedFans: event.dedicatedFansModifierLocal,
        externalIds: externalId(tpSystemId, event.tpEventId, 'home'),
      };
      setIfDefined(home, 'actingTeamEraId', homeTeamEraId);
      const away: UpsertMatchEvent = {
        matchId,
        actionType: 'dedicated_fans_roll',
        dedicatedFans: event.dedicatedFansModifierVisitor,
        externalIds: externalId(tpSystemId, event.tpEventId, 'away'),
      };
      setIfDefined(away, 'actingTeamEraId', awayTeamEraId);
      return [home, away];
    }
    case 'prayers_to_nuffle': {
      return [
        {
          matchId,
          actionType: 'prayers_to_nuffle',
          prayersToNuffle: event.prayersToNuffle,
          externalIds: externalId(tpSystemId, event.tpEventId),
        },
      ];
    }
    case 'concession': {
      const data: UpsertMatchEvent = {
        matchId,
        consequenceType: 'concession',
        externalIds: externalId(tpSystemId, event.tpEventId),
      };
      const concedingTeamEraId = event.concedeLocal
        ? homeTeamEraId
        : event.concedeVisitor
          ? awayTeamEraId
          : undefined;
      setIfDefined(data, 'consequenceTeamEraId', concedingTeamEraId);
      return [data];
    }
  }
}

/**
 * Build zero or more `UpsertMatchEvent`s for one TP match event. Touchdown
 * and injury events (an injury reporting `injuryType: 'None'` yields none)
 * are gameplay events; every other modeled TP event type is administrative
 * and delegates to {@link buildAdminEvents}.
 */
export function buildEventData(
  options: BuildEventDataOptions,
): UpsertMatchEvent[] {
  const { event } = options;
  switch (event.type) {
    case 'touchdown':
      return buildTouchdownEvent({ ...options, event });
    case 'injury':
      return buildInjuryEvent({ ...options, event });
    default:
      return buildAdminEvents({ ...options, event });
  }
}
