import type {
  ActionType,
  ConsequenceType,
  UpsertMatchEvent,
} from '@blood-bowl-tracker/api-contract';
import type { ImportError } from '@blood-bowl-tracker/import';
import { makeImportError } from '@blood-bowl-tracker/import';
import type { TpInjuryType, TpMatchEvent } from '@blood-bowl-tracker/parse-tp';

import type { CasualtyPairing } from './tp-match-events-correlation';

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

/**
 * Every administrative TP match event kind — everything except the
 * gameplay events (touchdown, injury, mvp_award, and the five other simple
 * action kinds, plus casualty_caused and sent_off), which are all built by
 * their own dedicated builders rather than {@link buildAdminEvents}.
 */
type TpAdminMatchEvent = Exclude<
  TpMatchEvent,
  | { type: 'touchdown' }
  | { type: 'completion' }
  | { type: 'interception' }
  | { type: 'deflection' }
  | { type: 'foul' }
  | { type: 'mvp_award' }
  | { type: 'successful_landing' }
  | { type: 'sent_off' }
  | { type: 'casualty_caused' }
  | { type: 'injury' }
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
  /** Casualty/injury pairing for this match — see {@link CasualtyPairing}. */
  casualtyPairing: CasualtyPairing;
}

/**
 * Map a TP `injuryType` to its `consequence_type`. Every value, including
 * `'None'` (a Badly Hurt result), maps to a real consequence.
 */
const INJURY_CONSEQUENCE_BY_TYPE: Record<TpInjuryType, ConsequenceType> = {
  None: 'badly_hurt',
  MissNextGame: 'miss_next_game',
  NigglingInjury: 'niggling_injury',
  Dead: 'death',
  AV: 'stat_reduction_av',
  ST: 'stat_reduction_st',
  MA: 'stat_reduction_ma',
  PA: 'stat_reduction_pa',
  AG: 'stat_reduction_ag',
};

/**
 * Map a TP `injuryType` to the acting-side severity bucket credited to
 * whoever caused it, adopting the same three-bucket convention
 * `tools/import-bbl`'s `SEVERITY_GROUPS` already establishes for this repo:
 * `badly_hurt` stays its own bucket, every lasting-injury/stat-reduction
 * result buckets into `serious_injury`, and `Dead` buckets into `death`.
 */
const INJURY_ACTION_SEVERITY_BY_TYPE: Record<TpInjuryType, ActionType> = {
  None: 'badly_hurt',
  MissNextGame: 'serious_injury',
  NigglingInjury: 'serious_injury',
  Dead: 'death',
  AV: 'serious_injury',
  ST: 'serious_injury',
  MA: 'serious_injury',
  PA: 'serious_injury',
  AG: 'serious_injury',
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

/**
 * The seven TP event kinds that are structurally identical action events:
 * one acting player, one acting team, no other payload. Touchdown and
 * mvp_award were already modeled this way; completion, interception,
 * deflection, foul, and successful_landing share the exact same shape.
 */
type TpSimpleActionEvent = Extract<
  TpMatchEvent,
  | { type: 'touchdown' }
  | { type: 'completion' }
  | { type: 'interception' }
  | { type: 'deflection' }
  | { type: 'foul' }
  | { type: 'mvp_award' }
  | { type: 'successful_landing' }
>;

/**
 * Build a simple, single-actor action event (touchdown, completion,
 * interception, deflection, foul, mvp_award, successful_landing) — the one
 * shape shared by all seven, previously duplicated per-kind as
 * `buildTouchdownEvent`/`buildMvpAwardEvent`.
 */
function buildSimpleActionEvent(
  options: BuildEventDataOptions & { event: TpSimpleActionEvent },
  actionType: ActionType,
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
    actionType,
    externalIds: externalId(tpSystemId, event.tpEventId),
  };
  setIfDefined(
    data,
    'actingTeamEraId',
    resolveTeamEraId({
      teamErasByRosterId,
      rosterId: event.rosterId,
      eraId,
    }),
  );
  setIfDefined(
    data,
    'actingPlayerId',
    resolvePlayer({
      lineUpId: event.lineUpId,
      matchId,
      playerIdsByLineUpId,
      errors,
    }),
  );
  return [data];
}

/**
 * Build a `sent_off` event — consequence-side (the player who got sent off),
 * not action-side. Deliberately standalone: TP's `sent_off` (code 32) does
 * not always follow a `foul` (code 31) by the same player (only 58% do
 * within 30s in real data; the rest are e.g. Secret Weapon auto-ejections),
 * so — per the confirmed design — the two are never correlated.
 */
function buildSentOffEvent(
  options: BuildEventDataOptions & {
    event: Extract<TpMatchEvent, { type: 'sent_off' }>;
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
    consequenceType: 'sent_off',
    externalIds: externalId(tpSystemId, event.tpEventId),
  };
  setIfDefined(
    data,
    'consequenceTeamEraId',
    resolveTeamEraId({
      teamErasByRosterId,
      rosterId: event.rosterId,
      eraId,
    }),
  );
  setIfDefined(
    data,
    'consequencePlayerId',
    resolvePlayer({
      lineUpId: event.lineUpId,
      matchId,
      playerIdsByLineUpId,
      errors,
    }),
  );
  return [data];
}

/**
 * Build a standalone `casualty_caused` event, for a code-6 that was NOT
 * paired with a code-8 injury (e.g. the casualty was erased by an
 * apothecary, so no injury roll was ever registered). Still credits the
 * specific acting player, using the generic `'casualty'` action type since
 * severity is unknown with no paired injury to report it.
 */
function buildCasualtyCausedEvent(
  options: BuildEventDataOptions & {
    event: Extract<TpMatchEvent, { type: 'casualty_caused' }>;
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
    actionType: 'casualty',
    externalIds: externalId(tpSystemId, event.tpEventId),
  };
  setIfDefined(
    data,
    'actingTeamEraId',
    resolveTeamEraId({
      teamErasByRosterId,
      rosterId: event.rosterId,
      eraId,
    }),
  );
  setIfDefined(
    data,
    'actingPlayerId',
    resolvePlayer({
      lineUpId: event.lineUpId,
      matchId,
      playerIdsByLineUpId,
      errors,
    }),
  );
  return [data];
}

/**
 * Build an `injury` (code 8) event. The consequence side (the victim +
 * severity) is always emitted, including `injuryType: 'None'` (a real Badly
 * Hurt result, not "nothing happened"). The action side is credited three
 * ways, in priority order:
 *
 * 1. Paired via `casualtyPairing` (a specific code-6 event correlated by
 *    turnNumber) — full credit: the specific acting player and their team,
 *    with the severity bucketed via {@link INJURY_ACTION_SEVERITY_BY_TYPE}.
 * 2. Not paired, but `turnRosterId` differs from the victim's roster —
 *    opponent-caused per TP's turn-owner field, but the specific player
 *    couldn't be pinned down (e.g. a cross-turn logging quirk); falls back
 *    to team-only credit with the same severity bucketing.
 * 3. Neither — self-inflicted or otherwise unattributable (a player falling
 *    on their own, or a random event); consequence-only, exactly as before.
 */
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
    casualtyPairing,
  } = options;
  const data: UpsertMatchEvent = {
    matchId,
    consequenceType: INJURY_CONSEQUENCE_BY_TYPE[event.injuryType],
    externalIds: externalId(tpSystemId, event.tpEventId),
  };
  setIfDefined(
    data,
    'consequenceTeamEraId',
    resolveTeamEraId({ teamErasByRosterId, rosterId: event.rosterId, eraId }),
  );
  setIfDefined(
    data,
    'consequencePlayerId',
    resolvePlayer({
      lineUpId: event.lineUpId,
      matchId,
      playerIdsByLineUpId,
      errors,
    }),
  );

  const pairedCasualty = casualtyPairing.casualtyByInjuryEventId.get(
    event.tpEventId,
  );
  if (pairedCasualty) {
    data.actionType = INJURY_ACTION_SEVERITY_BY_TYPE[event.injuryType];
    setIfDefined(
      data,
      'actingTeamEraId',
      resolveTeamEraId({
        teamErasByRosterId,
        rosterId: pairedCasualty.rosterId,
        eraId,
      }),
    );
    setIfDefined(
      data,
      'actingPlayerId',
      resolvePlayer({
        lineUpId: pairedCasualty.lineUpId,
        matchId,
        playerIdsByLineUpId,
        errors,
      }),
    );
  } else if (
    event.turnRosterId !== undefined &&
    event.turnRosterId !== event.rosterId
  ) {
    data.actionType = INJURY_ACTION_SEVERITY_BY_TYPE[event.injuryType];
    setIfDefined(
      data,
      'actingTeamEraId',
      resolveTeamEraId({
        teamErasByRosterId,
        rosterId: event.turnRosterId,
        eraId,
      }),
    );
  }
  // else: self-inflicted or unattributable — consequence-only. Normal and
  // expected (e.g. a player falling on their own, or a random event).
  return [data];
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
          eventType: 'weather',
          weatherType: event.weatherType,
          externalIds: externalId(tpSystemId, event.tpEventId),
        },
      ];
    }
    case 'inducements_roll': {
      const data: UpsertMatchEvent = {
        matchId,
        actionType: 'inducements',
        inducementsCost: event.totalCost,
        externalIds: externalId(tpSystemId, event.tpEventId),
      };
      setIfDefined(data, 'actingTeamEraId', actingTeamEraId(event.rosterId));
      setIfDefined(data, 'inducementsFromTreasury', event.fromTreasury);
      return [data];
    }
    case 'journeyman_signing': {
      const data: UpsertMatchEvent = {
        matchId,
        actionType: 'journeymen_signings',
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
        actionType: 'winnings',
        winnings: event.localWinnings,
        externalIds: externalId(tpSystemId, event.tpEventId, 'home'),
      };
      setIfDefined(home, 'actingTeamEraId', homeTeamEraId);
      const away: UpsertMatchEvent = {
        matchId,
        actionType: 'winnings',
        winnings: event.visitorWinnings,
        externalIds: externalId(tpSystemId, event.tpEventId, 'away'),
      };
      setIfDefined(away, 'actingTeamEraId', awayTeamEraId);
      return [home, away];
    }
    case 'fan_factor_roll': {
      const home: UpsertMatchEvent = {
        matchId,
        actionType: 'fan_factor',
        fanFactor: event.newFanFactorLocal,
        externalIds: externalId(tpSystemId, event.tpEventId, 'home'),
      };
      setIfDefined(home, 'actingTeamEraId', homeTeamEraId);
      const away: UpsertMatchEvent = {
        matchId,
        actionType: 'fan_factor',
        fanFactor: event.newFanFactorVisitor,
        externalIds: externalId(tpSystemId, event.tpEventId, 'away'),
      };
      setIfDefined(away, 'actingTeamEraId', awayTeamEraId);
      return [home, away];
    }
    case 'dedicated_fans_roll': {
      const events: UpsertMatchEvent[] = [];
      if (event.dedicatedFansModifierLocal !== 0) {
        const home: UpsertMatchEvent = {
          matchId,
          consequenceType: 'dedicated_fans',
          dedicatedFans: event.dedicatedFansModifierLocal,
          externalIds: externalId(tpSystemId, event.tpEventId, 'home'),
        };
        setIfDefined(home, 'consequenceTeamEraId', homeTeamEraId);
        events.push(home);
      }
      if (event.dedicatedFansModifierVisitor !== 0) {
        const away: UpsertMatchEvent = {
          matchId,
          consequenceType: 'dedicated_fans',
          dedicatedFans: event.dedicatedFansModifierVisitor,
          externalIds: externalId(tpSystemId, event.tpEventId, 'away'),
        };
        setIfDefined(away, 'consequenceTeamEraId', awayTeamEraId);
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
 * Build zero or more `UpsertMatchEvent`s for one TP match event. Touchdown,
 * completion, interception, deflection, foul, mvp_award, and
 * successful_landing are all built as simple single-actor action events;
 * sent_off is consequence-side; injury always yields at least a consequence
 * row (including `injuryType: 'None'`, a real Badly Hurt result);
 * casualty_caused yields nothing when it was paired with an injury event via
 * `casualtyPairing` (it's emitted as part of that injury's row instead), or
 * a standalone `'casualty'`-action row otherwise. Every other modeled TP
 * event type is administrative and delegates to {@link buildAdminEvents}.
 */
export function buildEventData(
  options: BuildEventDataOptions,
): UpsertMatchEvent[] {
  const { event, casualtyPairing } = options;
  switch (event.type) {
    case 'touchdown':
    case 'completion':
    case 'interception':
    case 'deflection':
    case 'foul':
    case 'successful_landing':
      return buildSimpleActionEvent({ ...options, event }, event.type);
    case 'mvp_award':
      return buildSimpleActionEvent({ ...options, event }, 'mvp_award');
    case 'sent_off':
      return buildSentOffEvent({ ...options, event });
    case 'injury':
      return buildInjuryEvent({ ...options, event });
    case 'casualty_caused':
      if (casualtyPairing.pairedCasualtyEventIds.has(event.tpEventId)) {
        return [];
      }
      return buildCasualtyCausedEvent({ ...options, event });
    default:
      return buildAdminEvents({ ...options, event });
  }
}
